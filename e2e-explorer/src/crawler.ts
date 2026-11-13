import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { LoginError, loginThroughUi, restoreSessionOnNewPage, type SessionSnapshot } from './auth.ts';
import { isInScope, type ExplorerConfig, type Shard } from './config.ts';
import { INPUT_KIND_LABELS, isInputKind, valueFor, type InputKind } from './inputs.ts';
import { errorMessage, warnOnFailure } from './errors.ts';
import { enumeratePage, installOracleHooks, Oracle, type AfterActionInfo, type RawFinding } from './oracle.ts';
import { ELEMENT_ID_ATTR, isFormNativelyInvalid, requestSubmit, type Enumeration, type PageElement } from './page-scripts.ts';
import { fingerprintOf, writeShardReport } from './report.ts';
import { deriveRng, shuffle } from './rng.ts';
import type { SharedRegistry } from './shared-registry.ts';
import type { ActionDescriptor, ElementRef, FieldValue, Finding, ShardReport, ShardStats, Step } from './types.ts';

/**
 * 巡回役（1 つの担当範囲）。
 *
 * SPA には「前の状態に戻す」一般的な方法がないため、操作のたびに新しいタブで起点を開き、
 * そこまでの操作を再生してから次の操作をする。再生の手順がそのまま再現手順になる。
 */

const ACTION_TIMEOUT_MS = 5_000;
/** 時間の上限を過ぎても終わらない担当範囲を打ち切るまでの猶予。応答のない待ちで止まり続けないようにする。 */
const WATCHDOG_GRACE_MS = 60_000;
/** 続けてログインし直してもセッションが切れたままになる回数の上限（ログアウトの操作のたびの再ログインは数えない）。 */
const MAX_CONSECUTIVE_RELOGINS = 3;
/** 設定に画面幅がないときの既定（Playwright の Desktop Chrome と同じ）。 */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const STATE_HASH_LENGTH = 12;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface CrawlOptions {
  /** 全体の出力先（レポートのパスはここからの相対で書く）。 */
  outDir: string;
  registry?: SharedRegistry;
  /** テスト用: コンテキストを作った直後に呼ぶ（route で偽のサイトを返すなど）。 */
  prepareContext?: (context: BrowserContext) => Promise<void>;
  log?: (message: string) => void;
}

interface QueueNode {
  path: ActionDescriptor[];
  depth: number;
}

class ReplayError extends Error {}

/** URL のパスの ID・数字を :id にそろえる（一覧の行ごとの詳細画面を 1 つの状態とみなすため）。 */
export function normalizePath(pathname: string): string {
  return pathname.replace(UUID_PATTERN, ':id').replace(/\/\d+(?=\/|$)/g, '/:id');
}

export function stateKeyOf(enumeration: Enumeration): string {
  const signatures = [...new Set(enumeration.elements.map((e) => e.signature))].sort();
  const forms = [...new Set(enumeration.forms.map((f) => f.signature))].sort();
  const material = JSON.stringify({ signatures, forms, dialog: enumeration.hasDialog });
  const hash = createHash('sha1').update(material).digest('hex').slice(0, STATE_HASH_LENGTH);
  return `${normalizePath(enumeration.pathname)}#${hash}`;
}

function describeElement(el: PageElement): string {
  const name = el.name || '(名前なし)';
  if (el.tag === 'a') return `リンク「${name}」`;
  if (el.tag === 'button' || el.role === 'button') return `ボタン「${name}」`;
  if (el.tag === 'select') return `選択肢「${name}」`;
  if (el.inputType === 'checkbox' || el.inputType === 'radio' || el.role === 'checkbox' || el.role === 'switch') {
    return `チェック「${name}」`;
  }
  if (el.isField) return `入力欄「${name}」`;
  return `${el.role || el.tag}「${name}」`;
}

function refOf(item: { signature: string; occurrence: number }): ElementRef {
  return { signature: item.signature, occurrence: item.occurrence };
}

function findId(items: { id: number; signature: string; occurrence: number }[], ref: ElementRef): number {
  const found = items.find((i) => i.signature === ref.signature && i.occurrence === ref.occurrence);
  if (!found) throw new ReplayError(`要素が見つかりません: ${ref.signature} #${ref.occurrence}`);
  return found.id;
}

function describeValue(value: string): string {
  const preview = value.length > 20 ? `${value.slice(0, 20)}…（${value.length} 文字）` : value;
  return JSON.stringify(preview);
}

export class ShardCrawler {
  private readonly browser: Browser;
  private readonly config: ExplorerConfig;
  private readonly shard: Shard;
  private readonly options: CrawlOptions;
  private readonly shardDir: string;
  private readonly artifactsDir: string;
  private context!: BrowserContext;
  private session: SessionSnapshot | null = null;
  private readonly startedAt = Date.now();
  private readonly visited = new Set<string>();
  private readonly queuedKeys = new Set<string>();
  private readonly seenFingerprints = new Set<string>();
  private artifactCounter = 0;
  private traceCounter = 0;
  private consecutiveRelogins = 0;
  private pendingTrace: string | null = null;
  /** 開いているタブで新しく見つかった疑い。trace を保存できなかったら trace のパスを外す。 */
  private pendingTraceFindings: Finding[] = [];
  private readonly report: ShardReport;
  private readonly stats: ShardStats = {
    states: 0,
    actions: 0,
    replays: 0,
    skippedShared: 0,
    claimedShared: 0,
    replayFailures: 0,
    placeholderStates: 0,
    relogins: 0,
    stoppedBy: 'queue-empty',
  };

  constructor(browser: Browser, config: ExplorerConfig, shard: Shard, options: CrawlOptions) {
    this.browser = browser;
    this.config = config;
    this.shard = shard;
    this.options = options;
    this.shardDir = path.join(options.outDir, 'shards', shard.id);
    this.artifactsDir = path.join(this.shardDir, 'artifacts');
    this.report = {
      shardId: shard.id,
      groupId: shard.groupId,
      role: shard.role,
      tenantId: shard.tenantId,
      seed: config.seed,
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: '',
      durationMs: 0,
      stats: this.stats,
      actionLog: [],
      states: [],
      outOfScope: [],
      replayFailures: [],
      findings: [],
    };
  }

  private log(message: string): void {
    this.options.log?.(`[${this.shard.id}] ${message}`);
  }

  private get startUrl(): string {
    return new URL(this.shard.startPath, this.config.target.baseUrl).toString();
  }

  private get isAnonymous(): boolean {
    return !!this.shard.roleConfig.anonymous;
  }

  async run(): Promise<ShardReport> {
    let context: BrowserContext | undefined;
    let watchdogFired = false;
    const watchdog = setTimeout(() => {
      watchdogFired = true;
      this.log('時間の上限を過ぎても終わらないため打ち切ります');
      // 待ち続けている操作は、コンテキストを閉じると例外で抜ける
      if (context) void warnOnFailure('打ち切りのためのコンテキストの終了', context.close(), (m) => this.log(m));
    }, this.config.limits.maxMinutes * 60_000 + WATCHDOG_GRACE_MS);
    try {
      // 準備（出力先・コンテキストの作成）の失敗も、この担当範囲のエラーとして記録する。
      // 外に投げると並列実行の Promise.all が失敗し、他のワーカーが使っているブラウザまで閉じられるため
      await mkdir(this.artifactsDir, { recursive: true });
      const viewport = this.config.oracle.viewports[0] ?? DEFAULT_VIEWPORT;
      context = await this.browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'ja-JP',
        timezoneId: 'Asia/Tokyo',
      });
      this.context = context;
      // 同じ出力先で流し直したとき、前回の自分の記録で共通の領域を飛ばさないよう手放す
      if (this.options.registry) await this.options.registry.releaseOwner(this.shard.id);
      await this.options.prepareContext?.(this.context);
      await installOracleHooks(this.context);
      if (!this.isAnonymous) await this.login();
      await this.context.tracing.start({ screenshots: true, snapshots: true });
      await this.explore();
    } catch (e) {
      this.stats.stoppedBy = 'error';
      const message = errorMessage(e);
      this.report.error = watchdogFired ? `時間の上限を過ぎても終わらないため打ち切りました（${message}）` : message;
      this.log(`中断: ${this.report.error}`);
    } finally {
      clearTimeout(watchdog);
      if (context && !watchdogFired) {
        await warnOnFailure('trace の終了', context.tracing.stop(), (m) => this.log(m));
        await warnOnFailure('コンテキストの終了', context.close(), (m) => this.log(m));
      }
    }
    this.report.finishedAt = new Date().toISOString();
    this.report.durationMs = Date.now() - this.startedAt;
    this.report.states = [...this.visited];
    await writeShardReport(this.shardDir, this.report);
    return this.report;
  }

  private async login(): Promise<void> {
    const page = await this.context.newPage();
    try {
      this.session = await loginThroughUi(page, this.config, this.shard);
      this.log(`ログインしました（テナント ${this.shard.tenantId}）`);
    } finally {
      await page.close();
    }
  }

  private loginSteps(): Step[] {
    if (this.isAnonymous) return [{ description: `未ログインのまま ${this.shard.startPath} を開く` }];
    const role = this.shard.roleConfig;
    return [
      {
        description:
          `ログイン画面（${this.config.target.login.path}）でテナント ID「${this.shard.tenantId}」・` +
          `ユーザー「${role.loginId}」でログインする（権限: ${this.shard.role}）`,
      },
      { description: `${this.shard.startPath} を開く` },
    ];
  }

  private budgetExceeded(): ShardStats['stoppedBy'] | null {
    if (this.stats.actions >= this.config.limits.maxActions) return 'max-actions';
    if (Date.now() - this.startedAt >= this.config.limits.maxMinutes * 60_000) return 'max-minutes';
    return null;
  }

  private async explore(): Promise<void> {
    const queue: QueueNode[] = [{ path: [], depth: 0 }];
    while (queue.length > 0) {
      const stop = this.budgetExceeded();
      if (stop) {
        this.stats.stoppedBy = stop;
        return;
      }
      const node = queue.shift() as QueueNode;
      const children = await this.exploreState(node);
      queue.push(...children);
    }
  }

  /** 1 つの状態を開き、そこでの操作をすべて試す。次にたどる状態を返す。 */
  private async exploreState(node: QueueNode): Promise<QueueNode[]> {
    const isRoot = node.path.length === 0;
    const opened = await this.openAt(node.path, isRoot);
    if (!opened) {
      // 起点を開けないと何も調べられない。「疑い 0 件」と区別できるよう担当範囲ごと止める
      if (isRoot) throw new Error(`起点 ${this.shard.startPath} を開けません: ${this.report.replayFailures.at(-1)?.reason ?? '不明'}`);
      return [];
    }
    const { page, oracle } = opened;
    let candidates: ActionDescriptor[];
    let stateKey: string;
    try {
      const enumeration = await this.enumerate(page);
      stateKey = stateKeyOf(enumeration);
      if (this.visited.has(stateKey)) return [];
      this.visited.add(stateKey);
      this.stats.states++;
      this.log(`状態 ${stateKey}（深さ ${node.depth}）`);

      if (await oracle.isPlaceholder()) this.stats.placeholderStates++;
      const stateFindings = await oracle.inspectState();
      await this.recordFindings(page, stateFindings, node.path);
      candidates = this.buildActions(enumeration, stateKey);
    } finally {
      await this.closePage(page);
    }

    const children: QueueNode[] = [];
    for (const action of candidates) {
      const stop = this.budgetExceeded();
      if (stop) {
        this.stats.stoppedBy = stop;
        break;
      }
      if (action.region && !(await this.claimShared(action))) continue;
      const outcome = await this.tryAction(node, action, stateKey);
      if (outcome.child) children.push(outcome.child);
      // 操作できなかった共通の領域は、他の担当範囲が調べられるよう手放す
      if (outcome.failed && action.region && this.options.registry) {
        await this.options.registry.release(this.sharedKey(action), this.shard.id);
      }
    }
    return children;
  }

  private sharedKey(action: ActionDescriptor): string {
    const parts = [action.region, action.kind, action.target.signature, String(action.target.occurrence), action.inputKind ?? ''];
    if (this.config.crawl.sharedRegistryPerRole) parts.unshift(this.shard.role);
    return parts.join('|');
  }

  private async claimShared(action: ActionDescriptor): Promise<boolean> {
    if (!this.options.registry) return true;
    const claimed = await this.options.registry.claim(this.sharedKey(action), this.shard.id);
    if (claimed) this.stats.claimedShared++;
    else this.stats.skippedShared++;
    return claimed;
  }

  /** 1 つの操作を試す。担当範囲内の新しい状態に進んだら child にその状態を返す。 */
  private async tryAction(
    node: QueueNode,
    action: ActionDescriptor,
    stateKey: string
  ): Promise<{ child: QueueNode | null; failed: boolean }> {
    const opened = await this.openAt(node.path, false);
    if (!opened) return { child: null, failed: true };
    const { page, oracle } = opened;
    const path = [...node.path, action];
    this.stats.actions++;
    this.report.actionLog.push(`${stateKey} :: ${action.label}`);
    try {
      const urlBefore = page.url();
      await oracle.begin({ abnormalInput: action.kind === 'fill-submit' || action.kind === 'fill-enter' });
      let nativeInvalid = false;
      const started = Date.now();
      try {
        nativeInvalid = await this.perform(page, oracle, action);
      } catch (e) {
        // 要素が隠れた・押せないなどで操作をやり切れなかった。再生失敗として残すが、
        // 途中で起きた症状（入力で呼ばれた API の 500、フォームを消した例外など）は失敗の原因かもしれないので記録する
        this.stats.replayFailures++;
        this.report.replayFailures.push({ path: path.map((a) => a.label), reason: errorMessage(e) });
        await oracle.waitForSettle();
        const { findings } = await oracle.end({ actionKind: 'load', nativeInvalid: false, urlBefore }, null);
        await this.recordFindings(page, findings, path);
        return { child: null, failed: true };
      }
      const settle = await oracle.waitForSettle();
      // 落ち着いたと判断するまでの無通信の時間は、操作にかかった時間に含めない
      const elapsed = settle.settled ? Math.max(0, Date.now() - started - this.config.timing.settleQuietMs) : null;
      const info: AfterActionInfo = { actionKind: action.kind, nativeInvalid, urlBefore };
      const { findings, enumeration: after } = await oracle.end(info, elapsed);
      await this.recordFindings(page, findings, path);

      const url = new URL(page.url());
      if (url.origin !== new URL(this.config.target.baseUrl).origin || !isInScope(this.shard, url.pathname)) {
        this.report.outOfScope.push({ fromPath: normalizePath(new URL(urlBefore).pathname), toUrl: page.url(), action: action.label });
        return { child: null, failed: false };
      }
      if (!after || node.depth + 1 > this.config.limits.maxDepth) return { child: null, failed: false };
      const key = stateKeyOf(after);
      if (this.visited.has(key) || this.queuedKeys.has(key)) return { child: null, failed: false };
      this.queuedKeys.add(key);
      return { child: { path, depth: node.depth + 1 }, failed: false };
    } finally {
      await this.closePage(page);
    }
  }

  /** 新しいタブで起点を開き、path の操作を再生する。observeLoad なら起点の読み込みを判定する。 */
  private async openAt(path: ActionDescriptor[], observeLoad: boolean): Promise<{ page: Page; oracle: Oracle } | null> {
    this.stats.replays++;
    await warnOnFailure('trace の記録の開始', this.context.tracing.startChunk(), (m) => this.log(m));
    const page = await this.context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    if (this.session) await restoreSessionOnNewPage(page, this.session);
    const oracle = new Oracle(this.config, page);
    try {
      if (observeLoad) await oracle.begin({ abnormalInput: false });
      await page.goto(this.startUrl, { waitUntil: 'domcontentloaded', timeout: this.config.timing.navigationTimeoutMs });
      await oracle.waitForSettle();

      if (!this.isAnonymous && new URL(page.url()).pathname === this.config.target.login.path) {
        // ログアウトの操作の後などでセッションが切れている。ログインし直してから開き直す
        if (observeLoad) await oracle.end({ actionKind: 'load', nativeInvalid: false, urlBefore: page.url() }, null);
        await this.closePage(page);
        await this.relogin();
        return this.openAt(path, observeLoad);
      }
      this.consecutiveRelogins = 0;

      if (observeLoad) {
        const { findings } = await oracle.end({ actionKind: 'load', nativeInvalid: false, urlBefore: page.url() }, null);
        await this.recordFindings(page, findings, []);
      }

      for (const action of path) {
        await this.perform(page, oracle, action);
        await oracle.waitForSettle();
      }
      return { page, oracle };
    } catch (e) {
      const reason = errorMessage(e);
      if (e instanceof LoginError) throw e;
      this.stats.replayFailures++;
      this.report.replayFailures.push({ path: path.map((a) => a.label), reason });
      this.log(`再生できませんでした: ${reason}`);
      await this.closePage(page);
      return null;
    }
  }

  /**
   * ログインし直す。ログアウトの操作のたびに呼ばれるため回数の合計には上限を付けず、
   * ログインし直しても起点がログイン画面のまま（セッションを保てない）状態が続いたときだけ止める。
   */
  private async relogin(): Promise<void> {
    if (this.consecutiveRelogins >= MAX_CONSECUTIVE_RELOGINS) {
      throw new LoginError(`ログインし直してもセッションが保てません（${MAX_CONSECUTIVE_RELOGINS} 回続けて失敗）`);
    }
    this.consecutiveRelogins++;
    this.stats.relogins++;
    await this.context.clearCookies();
    await this.login();
  }

  private async closePage(page: Page): Promise<void> {
    if (!page.isClosed()) await warnOnFailure('タブの終了', page.close(), (m) => this.log(m));
    const tracePath = this.pendingTrace;
    const findings = this.pendingTraceFindings;
    this.pendingTrace = null;
    this.pendingTraceFindings = [];
    const saved = await warnOnFailure(
      'trace の保存',
      this.context.tracing.stopChunk(tracePath ? { path: path.join(this.options.outDir, tracePath) } : undefined),
      (m) => this.log(m)
    );
    // 保存できなかった trace をレポートが指さないようにする
    if (!saved) for (const finding of findings) delete finding.trace;
  }

  private async enumerate(page: Page): Promise<Enumeration> {
    return enumeratePage(page, this.config);
  }

  /** 状態の要素から、試す操作の一覧を作る。順番は種と状態のキーから決める。 */
  private buildActions(enumeration: Enumeration, stateKey: string): ActionDescriptor[] {
    const actions: ActionDescriptor[] = [];
    const kinds = this.config.crawl.inputKinds.filter(isInputKind);
    const inputOptions = { defaultMaxLength: this.config.crawl.defaultMaxLength, longLength: this.config.crawl.longLength };

    for (const el of enumeration.elements) {
      const region = el.region ?? undefined;
      if (el.tag === 'a' && (el.external || el.opensNewTab || el.download)) continue;
      if (el.isSubmit) continue; // フォームの送信は fill-submit で行う
      if (el.inputType === 'checkbox' || el.inputType === 'radio' || el.role === 'checkbox' || el.role === 'switch') {
        actions.push({ kind: 'toggle', target: refOf(el), region, label: `${describeElement(el)}を切り替える` });
        continue;
      }
      if (el.isField) {
        if (el.formIndex !== null) continue; // フォームの欄はまとめて fill-submit で入れる
        const kindsForField: InputKind[] = el.tag === 'select' ? ['empty', 'max'] : kinds;
        for (const kind of kindsForField) {
          const rng = deriveRng(this.config.seed, `${stateKey}|${el.signature}|${el.occurrence}|${kind}`);
          const value = valueFor(kind, { inputType: el.inputType, maxLength: el.maxLength, options: el.options }, inputOptions, rng);
          if (value === null) continue;
          const values: FieldValue[] = [{ target: refOf(el), inputType: el.inputType, value }];
          if (el.tag === 'select') {
            actions.push({ kind: 'select', target: refOf(el), region, values, inputKind: kind, label: `${describeElement(el)}で ${describeValue(value)} を選ぶ` });
          } else {
            actions.push({
              kind: 'fill-enter',
              target: refOf(el),
              region,
              values,
              inputKind: kind,
              label: `${describeElement(el)}に「${INPUT_KIND_LABELS[kind]}」の値 ${describeValue(value)} を入れて Enter`,
            });
          }
        }
        continue;
      }
      actions.push({
        kind: 'click',
        target: refOf(el),
        region,
        label: `${describeElement(el)}${el.href ? `（${new URL(el.href).pathname}）` : ''}をクリック`,
      });
    }

    enumeration.forms.forEach((form, index) => {
      const fields = enumeration.elements.filter((e) => e.formIndex === index && e.isField);
      if (fields.length === 0) return;
      for (const kind of kinds) {
        const rng = deriveRng(this.config.seed, `${stateKey}|${form.signature}|${form.occurrence}|${kind}`);
        const values: FieldValue[] = [];
        for (const field of fields) {
          const value = valueFor(kind, { inputType: field.inputType, maxLength: field.maxLength, options: field.options }, inputOptions, rng);
          if (value !== null) values.push({ target: refOf(field), inputType: field.inputType, value });
        }
        const detail = values.map((v) => `${v.target.signature.split('|').pop()}=${describeValue(v.value)}`).join('、');
        actions.push({
          kind: 'fill-submit',
          target: refOf(form),
          region: form.region ?? undefined,
          values,
          inputKind: kind,
          label: `フォーム「${form.name || '(名前なし)'}」に「${INPUT_KIND_LABELS[kind]}」の値を入れて送信（${detail}）`,
        });
      }
    });

    const ordered = shuffle(actions, deriveRng(this.config.seed, stateKey));
    return ordered.slice(0, this.config.limits.maxActionsPerState);
  }

  private async locate(page: Page, ref: ElementRef): Promise<number> {
    return findId((await this.enumerate(page)).elements, ref);
  }

  private locator(page: Page, id: number) {
    return page.locator(`[${ELEMENT_ID_ATTR}="${id}"]`);
  }

  /** 操作を 1 つ行う。ブラウザの入力チェックで送信が止まったら true を返す。 */
  private async perform(page: Page, oracle: Oracle, action: ActionDescriptor): Promise<boolean> {
    switch (action.kind) {
      case 'click':
      case 'toggle': {
        const id = await this.locate(page, action.target);
        await oracle.armChangeWatcher();
        await this.locator(page, id).click({ timeout: ACTION_TIMEOUT_MS });
        return false;
      }
      case 'select': {
        const value = action.values?.[0];
        if (!value) return false;
        const id = await this.locate(page, action.target);
        await oracle.armChangeWatcher();
        await this.locator(page, id).selectOption(value.value, { timeout: ACTION_TIMEOUT_MS });
        return false;
      }
      case 'fill-enter': {
        const value = action.values?.[0];
        if (!value) return false;
        const id = await this.locate(page, action.target);
        await this.locator(page, id).fill(value.value, { timeout: ACTION_TIMEOUT_MS });
        await oracle.armChangeWatcher();
        await this.locator(page, id).press('Enter', { timeout: ACTION_TIMEOUT_MS });
        return false;
      }
      case 'fill-submit': {
        // 欄を全部 1 回の列挙で探す（列挙のたびに要素の番号が振り直されるため、番号は同じ列挙の中でだけ使う）
        const before = await this.enumerate(page);
        const fieldIds = (action.values ?? []).map((value) => ({ value, id: findId(before.elements, value.target) }));
        for (const { value, id } of fieldIds) {
          if (value.inputType === 'select') await this.locator(page, id).selectOption(value.value, { timeout: ACTION_TIMEOUT_MS });
          else await this.locator(page, id).fill(value.value, { timeout: ACTION_TIMEOUT_MS });
        }
        // 入力で画面が変わる（別のフォームが出るなど）ことがあるため、送信の前に探し直し、その列挙の番号だけを使う
        const filled = await this.enumerate(page);
        const formIndex = filled.forms.findIndex(
          (f) => f.signature === action.target.signature && f.occurrence === action.target.occurrence
        );
        if (formIndex < 0) throw new ReplayError(`フォームが見つかりません: ${action.target.signature} #${action.target.occurrence}`);
        const formId = filled.forms[formIndex].id;
        const invalid = await page.evaluate(isFormNativelyInvalid, { attr: ELEMENT_ID_ATTR, id: formId });
        const submit = filled.elements.find((e) => e.formIndex === formIndex && e.isSubmit);
        await oracle.armChangeWatcher();
        if (submit) await this.locator(page, submit.id).click({ timeout: ACTION_TIMEOUT_MS });
        else await page.evaluate(requestSubmit, { attr: ELEMENT_ID_ATTR, id: formId });
        return invalid;
      }
    }
  }

  private async recordFindings(page: Page, raws: RawFinding[], path: ActionDescriptor[]): Promise<void> {
    if (raws.length === 0) return;
    const steps: Step[] = [...this.loginSteps(), ...path.map((action) => ({ description: action.label, action }))];
    let screenshot: string | undefined;
    for (const raw of raws) {
      const fingerprint = fingerprintOf(raw);
      const isNew = !this.seenFingerprints.has(fingerprint);
      this.seenFingerprints.add(fingerprint);
      const finding: Finding = {
        ...raw,
        fingerprint,
        shardId: this.shard.id,
        role: this.shard.role,
        steps,
        pageUrl: page.url(),
      };
      if (isNew) {
        // 新しい症状だけスクリーンショットと trace を残す（同じ症状の 2 回目以降は数えるだけ）
        if (!screenshot) screenshot = await this.takeScreenshot(page);
        finding.screenshot = screenshot;
        if (!this.pendingTrace) this.pendingTrace = this.artifactPath(`trace-${++this.traceCounter}.zip`);
        finding.trace = this.pendingTrace;
        this.pendingTraceFindings.push(finding);
      }
      this.report.findings.push(finding);
    }
  }

  private artifactPath(name: string): string {
    return path.relative(this.options.outDir, path.join(this.artifactsDir, name)).split(path.sep).join('/');
  }

  private async takeScreenshot(page: Page): Promise<string | undefined> {
    const relative = this.artifactPath(`screenshot-${++this.artifactCounter}.png`);
    try {
      await page.screenshot({ path: path.join(this.options.outDir, relative) });
      return relative;
    } catch (e) {
      this.log(`スクリーンショットを撮れませんでした: ${errorMessage(e)}`);
      return undefined;
    }
  }
}

export async function crawlShard(
  browser: Browser,
  config: ExplorerConfig,
  shard: Shard,
  options: CrawlOptions
): Promise<ShardReport> {
  return new ShardCrawler(browser, config, shard, options).run();
}
