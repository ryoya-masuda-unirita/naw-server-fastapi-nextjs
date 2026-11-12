import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, type Browser } from '@playwright/test';
import { expandShards, type ExplorerConfig } from '../src/config.ts';
import { crawlShard } from '../src/crawler.ts';
import { SharedRegistry } from '../src/shared-registry.ts';
import type { ShardReport } from '../src/types.ts';
import { installTestSite, newSiteLog, onlyShard, testConfig, type SiteLog } from './fixtures/test-site.ts';

/** 巡回役の単体テスト。テスト用サイトを実際に巡回し、たどり方と記録を確かめる。 */

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), 'e2e-explorer-test-'));
}

async function crawl(
  browser: Browser,
  config: ExplorerConfig,
  { log = newSiteLog(), outDir, registry, shardIndex = 0 }: { log?: SiteLog; outDir?: string; registry?: SharedRegistry; shardIndex?: number } = {}
): Promise<{ report: ShardReport; log: SiteLog; outDir: string }> {
  const dir = outDir ?? (await tempDir());
  const shard = expandShards(config)[shardIndex];
  const report = await crawlShard(browser, config, shard, {
    outDir: dir,
    registry,
    prepareContext: async (context) => {
      await installTestSite(context, log);
    },
  });
  return { report, log, outDir: dir };
}

const kindsOf = (report: ShardReport) => new Set(report.findings.map((f) => f.kind));

test('crawls recursively and finds suspicions on every page', async ({ browser }) => {
  /** 起点からリンクをたどって各画面の疑い（500・コンソール・はみ出し・真っ白・何も起きない）を見つけ、再現手順と証跡を残すこと */
  const { report, outDir } = await crawl(browser, testConfig());
  expect(report.error).toBeUndefined();
  const kinds = kindsOf(report);
  for (const kind of ['http-5xx', 'console-error', 'uncaught-exception', 'horizontal-scroll', 'blank-screen', 'no-effect'] as const) {
    expect(kinds, `${kind} が見つかること`).toContain(kind);
  }
  const serverError = report.findings.find((f) => f.kind === 'http-5xx');
  expect(serverError?.steps[0].description).toContain('未ログインのまま / を開く');
  expect(serverError?.steps.map((s) => s.description)).toEqual([
    '未ログインのまま / を開く',
    'リンク「サーバーエラー」（/server-error）をクリック',
    'ボタン「読み込む」をクリック',
  ]);
  expect(serverError?.screenshot && existsSync(path.join(outDir, serverError.screenshot))).toBeTruthy();
  expect(serverError?.trace && existsSync(path.join(outDir, serverError.trace))).toBeTruthy();
  expect(existsSync(path.join(outDir, 'shards', report.shardId, 'shard-report.json'))).toBeTruthy();
});

test('visits the same state only once', async ({ browser }) => {
  /** 自分自身へのリンクなどで同じ状態に戻っても、状態は 1 回だけ数えること */
  const { report } = await crawl(browser, testConfig());
  expect(new Set(report.states).size).toBe(report.states.length);
  expect(report.states.filter((s) => s.startsWith('/#'))).toHaveLength(1);
});

test('respects depth and action limits', async ({ browser }) => {
  /** 深さ 0 なら起点の操作だけ、操作回数の上限を超えないこと */
  const shallow = await crawl(browser, testConfig({ maxDepth: 0 }));
  expect(shallow.report.stats.states).toBe(1);

  const limited = await crawl(browser, testConfig({ maxActions: 5 }));
  expect(limited.report.stats.actions).toBe(5);
  expect(limited.report.stats.stoppedBy).toBe('max-actions');
});

test('crawls in the same order for the same seed', async ({ browser }) => {
  /** 同じ種なら同じ順で操作し、違う種なら順番が変わること */
  const first = await crawl(browser, testConfig({ maxDepth: 1, seed: 7 }));
  const second = await crawl(browser, testConfig({ maxDepth: 1, seed: 7 }));
  const other = await crawl(browser, testConfig({ maxDepth: 1, seed: 8 }));
  expect(second.report.actionLog).toEqual(first.report.actionLog);
  expect(other.report.actionLog).not.toEqual(first.report.actionLog);
  expect([...other.report.actionLog].sort()).toEqual([...first.report.actionLog].sort());
});

test('submits boundary and abnormal values', async ({ browser }) => {
  /** フォームに空・最大・最大+1・記号・絵文字・負の数・長い文字列を入れて送信すること */
  const config = testConfig({
    groups: [{ id: 'form', startPath: '/form', include: ['^/form$'], roles: ['anonymous'] }],
  });
  const { log } = await crawl(browser, config);
  const names = log.echoBodies.map((b) => b.name);
  // maxlength=10 の欄。10 文字を超える値（最大+1・記号・絵文字・長い文字列）はブラウザが 10 文字で切る
  expect(names).toEqual(expect.arrayContaining(['', 'a'.repeat(10), '-1', '!"#$%&\'()*', 'あ'.repeat(10)]));
  expect(names.filter((n) => n === 'a'.repeat(10))).toHaveLength(2);
  expect(names.some((n) => n.startsWith('😀'))).toBe(true);
  const counts = log.echoBodies.map((b) => b.count);
  expect(counts).toEqual(expect.arrayContaining(['2147483647', '2147483648', '-1', '1e3']));
  expect(log.echoBodies).toHaveLength(7);
});

test('records out-of-scope navigation without exploring it', async ({ browser }) => {
  /** 担当外の画面へ遷移したら掘らずに担当外として記録すること */
  const { report } = await crawl(browser, testConfig({ maxDepth: 1 }));
  const outside = report.outOfScope.find((o) => o.toUrl.endsWith('/outside'));
  expect(outside?.fromPath).toBe('/');
  expect(report.states.some((s) => s.startsWith('/outside'))).toBe(false);
});

test('logs in through the login page and stays logged in on new tabs', async ({ browser }) => {
  /** ログイン画面に入力してログインし、再生用の新しいタブでもログインしたまま操作できること */
  const config = testConfig({
    groups: [{ id: 'home', startPath: '/home', include: ['^/home$'], roles: ['tester'] }],
  });
  const { report, log } = await crawl(browser, config);
  expect(report.error).toBeUndefined();
  expect(report.states.some((s) => s.startsWith('/home'))).toBe(true);
  expect(log.apiCalls).toContain('/api/whoami');
  // sessionStorage のテナント ID が戻っていなければ /api/whoami が 401 になる
  expect(report.findings.filter((f) => f.kind === 'http-4xx')).toEqual([]);
  expect(report.findings[0]?.steps[0].description ?? report.actionLog[0]).toBeTruthy();
});

test('skips external links and excluded elements', async ({ browser }) => {
  /** 別オリジンへのリンクと除外指定の要素は操作しないこと */
  const { report, log } = await crawl(browser, testConfig({ maxDepth: 0 }));
  expect(report.actionLog.some((a) => a.includes('外部'))).toBe(false);
  expect(report.actionLog.some((a) => a.includes('除外'))).toBe(false);
  expect(log.excludedClicks).toBe(0);
});

test('shares explored common regions between shards', async ({ browser }) => {
  /** 同じ調査済みの一覧を使う 2 つの担当範囲では、共通領域のボタンを合計 1 回だけ操作すること */
  const config = testConfig({
    maxDepth: 1,
    groups: [
      { id: 'a', startPath: '/noop', include: ['^/noop$'], roles: ['anonymous'] },
      { id: 'b', startPath: '/normal', include: ['^/normal$'], roles: ['anonymous'] },
    ],
  });
  const outDir = await tempDir();
  const registry = new SharedRegistry(path.join(outDir, 'shared-explored.json'));
  const log = newSiteLog();
  const [a, b] = await Promise.all([
    crawl(browser, config, { log, outDir, registry, shardIndex: 0 }),
    crawl(browser, config, { log, outDir, registry, shardIndex: 1 }),
  ]);
  expect(log.sideClicks).toBe(1);
  expect(a.report.stats.claimedShared + b.report.stats.claimedShared).toBe(1);
  expect(a.report.stats.skippedShared + b.report.stats.skippedShared).toBe(1);
});

test('stops the shard with an error when the start page cannot be opened', async ({ browser }) => {
  /** 起点を開けないときは、疑い 0 件と区別できるよう担当範囲をエラーで止めること */
  const config = testConfig();
  // 何も待ち受けていないポート（テスト用サイトの route も掛からない）
  config.target.baseUrl = 'http://127.0.0.1:65531';
  const { report } = await crawl(browser, config);
  expect(report.stats.stoppedBy).toBe('error');
  expect(report.error).toContain('起点 / を開けません');
  expect(report.stats.states).toBe(0);
});

test('uses the only shard helper', async () => {
  /** テスト用の設定から担当範囲が 1 つ作れること */
  expect(onlyShard(testConfig()).id).toBe('site-anonymous');
});
