import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page, Request, Response } from '@playwright/test';
import type { ExplorerConfig } from './config.ts';
import {
  drainRejections,
  ELEMENT_ID_ATTR,
  enumerateElements,
  inspectBlank,
  inspectLayout,
  installChangeWatcher,
  readChangeWatcher,
  rejectionCollectorScript,
  type Enumeration,
} from './page-scripts.ts';
import type { FindingKind, Severity } from './types.ts';

/**
 * 判定役。ページの通信・コンソール・例外を見張り、begin() 〜 end() の間に起きたものを
 * 「バグの疑い」として返す。再生中（begin の前）に起きたものは、前の操作の疑いとして
 * 記録済みのため数えない。
 */

export interface RawFinding {
  kind: FindingKind;
  severity: Severity;
  title: string;
  location: string;
  message: string;
  details?: Record<string, unknown>;
}

export const KIND_TITLES: Record<FindingKind, string> = {
  'http-5xx': 'API が 500 番台を返した',
  'http-4xx': 'API が想定外の 4xx を返した',
  'network-failure': '通信に失敗した',
  'console-error': 'コンソールにエラーが出た',
  'uncaught-exception': '画面で未処理の例外が起きた',
  'unhandled-rejection': '画面で Promise の reject が処理されなかった',
  'blank-screen': '画面が真っ白になった',
  'no-effect': '操作しても何も起きなかった',
  'dead-end': '操作できる要素がない画面に行き着いた（戻れない）',
  'horizontal-scroll': '横スクロールが出た',
  'element-overflow': '要素・文字がはみ出した',
  a11y: 'アクセシビリティの違反',
  'slow-response': 'API の応答が遅い',
  'slow-action': '操作の後、画面が落ち着くまでが遅い',
};

const SEVERITY_OF: Record<FindingKind, Severity> = {
  'http-5xx': 'high',
  'http-4xx': 'medium',
  'network-failure': 'medium',
  'console-error': 'medium',
  'uncaught-exception': 'high',
  'unhandled-rejection': 'high',
  'blank-screen': 'high',
  'no-effect': 'low',
  'dead-end': 'medium',
  'horizontal-scroll': 'low',
  'element-overflow': 'low',
  a11y: 'medium',
  'slow-response': 'low',
  'slow-action': 'low',
};

const MESSAGE_MAX_LENGTH = 500;
const LAYOUT_REPORT_LIMIT = 5;
const ABORTED_ERROR = 'net::ERR_ABORTED';
const SETTLE_POLL_MS = 50;

export interface SettleResult {
  elapsedMs: number;
  settled: boolean;
}

/** 操作できる要素を列挙する（巡回役と判定役で同じ条件を使う）。 */
export async function enumeratePage(page: Page, config: ExplorerConfig): Promise<Enumeration> {
  return page.evaluate(enumerateElements, {
    attr: ELEMENT_ID_ATTR,
    excludeSelectors: config.crawl.excludeSelectors,
    sharedRegions: config.crawl.sharedRegions,
  });
}

export function rawFinding(
  kind: FindingKind,
  location: string,
  message: string,
  details?: Record<string, unknown>
): RawFinding {
  return {
    kind,
    severity: SEVERITY_OF[kind],
    title: KIND_TITLES[kind],
    location,
    message: message.slice(0, MESSAGE_MAX_LENGTH),
    details,
  };
}

/** 判定役が使う見張りを、コンテキストの全ページに入れる。ページを開く前に呼ぶ。 */
export async function installOracleHooks(context: BrowserContext): Promise<void> {
  await context.addInitScript(rejectionCollectorScript);
}

export interface ObservationOptions {
  /** 異常値を送信する操作か（想定内の 4xx の判定に使う）。 */
  abnormalInput: boolean;
}

export interface AfterActionInfo {
  actionKind: 'click' | 'fill-submit' | 'fill-enter' | 'select' | 'toggle' | 'load';
  /** ブラウザの入力チェックで送信が止まった。 */
  nativeInvalid: boolean;
  urlBefore: string;
}

export interface ObservationResult {
  findings: RawFinding[];
  /** 操作後の画面の要素（評価できなかったら null）。巡回役が次の状態のキーに使う。 */
  enumeration: Enumeration | null;
}

interface Observation {
  options: ObservationOptions;
  startedAt: number;
  findings: RawFinding[];
  requests: number;
  dialogs: number;
  popups: number;
  pageErrors: string[];
}

export class Oracle {
  private readonly config: ExplorerConfig;
  private readonly page: Page;
  private readonly baseOrigin: string;
  private readonly apiOrigin: string;
  private readonly ignoreConsole: RegExp[];
  private inflight = 0;
  private lastActivity = Date.now();
  private observation: Observation | null = null;
  /** 応答時間は自分で測る（route で返した応答などは request.timing() に値が入らないため）。 */
  private readonly requestStarts = new WeakMap<Request, number>();

  constructor(config: ExplorerConfig, page: Page) {
    this.config = config;
    this.page = page;
    this.baseOrigin = new URL(config.target.baseUrl).origin;
    this.apiOrigin = new URL(config.target.apiUrl).origin;
    this.ignoreConsole = config.oracle.ignoreConsole.map((p) => new RegExp(p));
    this.attach();
  }

  private attach(): void {
    const page = this.page;
    page.on('request', (request) => {
      this.requestStarts.set(request, Date.now());
      this.inflight++;
      this.lastActivity = Date.now();
      if (this.observation) this.observation.requests++;
    });
    page.on('requestfinished', (request) => {
      this.settleRequest();
      this.onRequestFinished(request);
    });
    page.on('requestfailed', (request) => {
      this.settleRequest();
      this.onRequestFailed(request);
    });
    page.on('response', (response) => this.onResponse(response));
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (this.ignoreConsole.some((re) => re.test(text))) return;
      this.record(rawFinding('console-error', this.pagePath(), text));
    });
    page.on('pageerror', (error) => {
      if (!this.observation) return;
      this.observation.pageErrors.push(error.message);
      this.record(
        rawFinding('uncaught-exception', this.pagePath(), `${error.name}: ${error.message}`, {
          stack: (error.stack ?? '').slice(0, MESSAGE_MAX_LENGTH * 2),
        })
      );
    });
    page.on('dialog', (dialog) => {
      if (this.observation) this.observation.dialogs++;
      const handle = this.config.crawl.dialogs === 'accept' ? dialog.accept() : dialog.dismiss();
      handle.catch((e: unknown) => console.warn(`ダイアログを閉じられませんでした: ${String(e)}`));
    });
    page.on('popup', (popup) => {
      if (this.observation) this.observation.popups++;
      // 新しいタブは巡回の対象外。開いたことだけを「変化」として数えて閉じる
      popup.close().catch((e: unknown) => console.warn(`新しいタブを閉じられませんでした: ${String(e)}`));
    });
  }

  private settleRequest(): void {
    this.inflight = Math.max(0, this.inflight - 1);
    this.lastActivity = Date.now();
  }

  private record(finding: RawFinding): void {
    this.observation?.findings.push(finding);
  }

  pagePath(): string {
    try {
      return new URL(this.page.url()).pathname;
    } catch {
      return this.page.url();
    }
  }

  /** API なら `GET /api/xxx`、別オリジンなら origin 付き。クエリは場所に含めない。 */
  private requestLocation(request: Request): string {
    const url = new URL(request.url());
    const origin = url.origin === this.apiOrigin || url.origin === this.baseOrigin ? '' : url.origin;
    return `${request.method()} ${origin}${url.pathname}`;
  }

  private isExpectedStatus(request: Request, status: number): boolean {
    const pathname = new URL(request.url()).pathname;
    const pagePath = this.pagePath();
    return this.config.oracle.expectedHttp.some((rule) => {
      if (!rule.status.includes(status)) return false;
      if (rule.method && rule.method.toUpperCase() !== request.method()) return false;
      if (rule.path && !new RegExp(rule.path).test(pathname)) return false;
      if (rule.pagePath && !new RegExp(rule.pagePath).test(pagePath)) return false;
      if (rule.onlyAfterAbnormalInput && !this.observation?.options.abnormalInput) return false;
      return true;
    });
  }

  private onResponse(response: Response): void {
    if (!this.observation) return;
    const status = response.status();
    const request = response.request();
    if (status >= 500) {
      this.record(
        rawFinding('http-5xx', this.requestLocation(request), `HTTP ${status} ${response.statusText()}`, {
          status,
          url: request.url(),
        })
      );
    } else if (status >= 400 && !this.isExpectedStatus(request, status)) {
      this.record(
        rawFinding('http-4xx', this.requestLocation(request), `HTTP ${status} ${response.statusText()}`, {
          status,
          url: request.url(),
        })
      );
    }
  }

  private onRequestFinished(request: Request): void {
    const startedAt = this.requestStarts.get(request);
    if (!this.observation || startedAt === undefined) return;
    const duration = Date.now() - startedAt;
    if (duration > this.config.oracle.slowResponseMs) {
      this.record(
        rawFinding('slow-response', this.requestLocation(request), `${Math.round(duration)}ms`, {
          durationMs: Math.round(duration),
          thresholdMs: this.config.oracle.slowResponseMs,
        })
      );
    }
  }

  private onRequestFailed(request: Request): void {
    if (!this.observation) return;
    const errorText = request.failure()?.errorText ?? 'unknown';
    // 遷移で打ち切られた通信はブラウザの通常の動きなので数えない
    if (errorText === ABORTED_ERROR) return;
    this.record(rawFinding('network-failure', this.requestLocation(request), errorText, { url: request.url() }));
  }

  /**
   * 通信が settleQuietMs のあいだ途切れるまで待つ（上限 settleTimeoutMs）。
   * 上限まで待っても落ち着かなかった（定期的な問い合わせ・開きっぱなしの通信がある）ときは settled が false。
   */
  async waitForSettle(): Promise<SettleResult> {
    const { settleQuietMs, settleTimeoutMs } = this.config.timing;
    const started = Date.now();
    while (Date.now() - started < settleTimeoutMs) {
      if (this.inflight === 0 && Date.now() - this.lastActivity >= settleQuietMs) {
        return { elapsedMs: Date.now() - started, settled: true };
      }
      await new Promise((r) => setTimeout(r, SETTLE_POLL_MS));
    }
    return { elapsedMs: Date.now() - started, settled: false };
  }

  async begin(options: ObservationOptions): Promise<void> {
    // 操作の直後に起きる例外などを取りこぼさないよう、無通信の時間は操作の開始から数える
    this.lastActivity = Date.now();
    this.observation = {
      options,
      startedAt: Date.now(),
      findings: [],
      requests: 0,
      dialogs: 0,
      popups: 0,
      pageErrors: [],
    };
    await this.drainRejectionsSafely();
  }

  /** 操作の直前に呼ぶ。DOM の変化を数え始める。 */
  async armChangeWatcher(): Promise<void> {
    this.lastActivity = Date.now();
    await this.page.evaluate(installChangeWatcher).catch((e: unknown) => {
      console.warn(`変化の見張りを入れられませんでした: ${String(e)}`);
    });
  }

  private async drainRejectionsSafely(): Promise<string[]> {
    try {
      return await this.page.evaluate(drainRejections);
    } catch {
      // 遷移の途中などで評価できないときは、その分を取りこぼす（巡回は続ける）
      return [];
    }
  }

  /**
   * 操作の後の判定。操作が終わって通信が落ち着いた後に呼ぶ。
   * 真っ白・何も起きない・戻れない・遅い操作を判定し、観測中の疑いと合わせて返す。
   * elapsedMs が null（通信が落ち着かないまま待つのをやめた）なら、遅い操作の判定はしない。
   * 定期的な問い合わせのある画面で、すべての操作が「遅い」になるのを避けるため。
   */
  async end(info: AfterActionInfo, elapsedMs: number | null): Promise<ObservationResult> {
    const observation = this.observation;
    if (!observation) return { findings: [], enumeration: null };
    const location = this.pagePath();
    // 要素の列挙は目印の属性を書き換えて DOM の変化に数えられてしまうため、変化を読んでから行う
    // 評価できない＝画面ごと遷移して見張りが消えた。遷移は「何かが起きた」なので変化ありとみなす
    const changes = info.actionKind === 'load' ? 0 : await this.page.evaluate(readChangeWatcher).catch(() => -1);
    const enumeration = await this.enumerate();

    for (const message of await this.drainRejectionsSafely()) {
      // Chromium は reject を pageerror でも通知することがあるため、同じ内容は 1 件にする
      if (observation.pageErrors.some((m) => message.includes(m))) continue;
      this.record(rawFinding('unhandled-rejection', location, message));
    }

    // 遷移の途中で評価できないときは、真っ白かどうかを判定しない（次の状態で判定される）
    const blank = await this.page.evaluate(inspectBlank).catch(() => null);
    if (blank && blank.textLength === 0 && blank.mediaCount === 0) {
      this.record(rawFinding('blank-screen', location, '本文の文字も画像もない'));
    }

    if (info.actionKind !== 'load') {
      const urlChanged = this.page.url() !== info.urlBefore;
      const anyEffect =
        changes !== 0 || urlChanged || observation.requests > 0 || observation.dialogs > 0 || observation.popups > 0;
      const expectsEffect = info.actionKind === 'click' || info.actionKind === 'fill-submit' || info.actionKind === 'fill-enter';
      if (!anyEffect && expectsEffect && !info.nativeInvalid) {
        this.record(rawFinding('no-effect', location, '画面の変化・遷移・通信・ダイアログのどれもなかった'));
      }
    }

    if (enumeration && enumeration.elements.length === 0 && !(blank && blank.textLength === 0)) {
      this.record(
        rawFinding(
          'dead-end',
          location,
          enumeration.hasErrorMessage ? 'エラー表示があり、操作できる要素がない' : '操作できる要素がない'
        )
      );
    }

    if (elapsedMs !== null && elapsedMs > this.config.oracle.slowActionMs) {
      this.record(
        rawFinding('slow-action', location, `${elapsedMs}ms`, {
          elapsedMs,
          thresholdMs: this.config.oracle.slowActionMs,
        })
      );
    }

    this.observation = null;
    return { findings: observation.findings, enumeration };
  }

  async enumerate(): Promise<Enumeration | null> {
    try {
      return await enumeratePage(this.page, this.config);
    } catch {
      // 遷移の途中などで評価できないときは、次の状態を作らない
      return null;
    }
  }

  /** 状態ごとに 1 回だけ行う判定（表示崩れ・アクセシビリティ）。 */
  async inspectState(): Promise<RawFinding[]> {
    const page = this.page;
    const location = this.pagePath();
    const findings: RawFinding[] = [];
    const original = page.viewportSize();
    const tolerance = this.config.oracle.overflowTolerancePx;

    for (const viewport of this.config.oracle.viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      // 画面幅の変更に合わせた再描画を待つ
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const layout = await page.evaluate(inspectLayout, { tolerance, limit: LAYOUT_REPORT_LIMIT });
      if (layout.scrollWidth > layout.clientWidth + tolerance) {
        findings.push(
          rawFinding(
            'horizontal-scroll',
            `${location} @${viewport.name}`,
            `ページの幅 ${layout.scrollWidth}px が画面の幅 ${layout.clientWidth}px を超える`,
            { viewport, protruding: layout.protruding }
          )
        );
      }
      for (const item of layout.protruding) {
        findings.push(
          rawFinding('element-overflow', `${location} @${viewport.name}`, `${item.selector} が画面の右端からはみ出す`, {
            viewport,
            right: item.right,
          })
        );
      }
      for (const item of layout.textOverflow) {
        findings.push(
          rawFinding('element-overflow', `${location} @${viewport.name}`, `${item.selector} の文字が枠からはみ出す`, {
            viewport,
            scrollWidth: item.scrollWidth,
            clientWidth: item.clientWidth,
          })
        );
      }
    }
    if (original) await page.setViewportSize(original);

    if (this.config.oracle.axe) {
      try {
        const results = await new AxeBuilder({ page }).analyze();
        for (const violation of results.violations) {
          if (!violation.impact || !this.config.oracle.axeImpacts.includes(violation.impact)) continue;
          findings.push(
            rawFinding('a11y', `${location} [${violation.id}]`, `${violation.impact}: ${violation.help}`, {
              rule: violation.id,
              impact: violation.impact,
              helpUrl: violation.helpUrl,
              targets: violation.nodes.slice(0, LAYOUT_REPORT_LIMIT).map((n) => n.target.join(' ')),
            })
          );
        }
      } catch (e) {
        console.warn(`axe を実行できませんでした（${location}）: ${String(e)}`);
      }
    }
    return findings;
  }
}
