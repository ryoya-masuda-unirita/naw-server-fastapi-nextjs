import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import type { ExplorerConfig, Shard } from './config.ts';
import { crawlShard } from './crawler.ts';
import { mergeReports, readShardReports, writeMergedReport, type WrittenReport } from './report.ts';
import { SharedRegistry } from './shared-registry.ts';
import { errorMessage } from './errors.ts';
import type { MergedReport, ShardReport } from './types.ts';

/**
 * 担当範囲を並列数ぶんのワーカーで巡回する。
 * ワーカーは担当範囲の待ち行列から設定の順に 1 つずつ取る。担当範囲ごとにテナントと
 * ブラウザのコンテキストが分かれているため、どのワーカーがどれを取ってもデータは混ざらない。
 */

export const SHARED_REGISTRY_FILE = 'shared-explored.json';

export interface RunOptions {
  outDir: string;
  workers: number;
  headed?: boolean;
  /** 共通領域の調査済みの一覧を使わない（担当範囲を単独で完全に再現したいとき）。 */
  noSharedRegistry?: boolean;
  browser?: Browser;
  prepareContext?: (context: BrowserContext) => Promise<void>;
  log?: (message: string) => void;
}

export interface RunResult {
  reports: ShardReport[];
  /** 結果（shard-report.json）すら残せなかった担当範囲。 */
  failures: string[];
  merged: MergedReport;
  files: WrittenReport;
}

export async function runShards(config: ExplorerConfig, shards: Shard[], options: RunOptions): Promise<RunResult> {
  const browser = options.browser ?? (await chromium.launch({ headless: !options.headed }));
  const registry = options.noSharedRegistry ? undefined : new SharedRegistry(path.join(options.outDir, SHARED_REGISTRY_FILE));
  const queue = [...shards];
  const reports: ShardReport[] = [];
  const failures: string[] = [];
  const workerCount = Math.max(1, Math.min(options.workers, shards.length));

  const worker = async (workerNo: number): Promise<void> => {
    for (;;) {
      const shard = queue.shift();
      if (!shard) return;
      options.log?.(`ワーカー ${workerNo}: ${shard.id} を開始`);
      let report: ShardReport;
      try {
        report = await crawlShard(browser, config, shard, {
          outDir: options.outDir,
          registry,
          prepareContext: options.prepareContext,
          log: options.log,
        });
      } catch (e) {
        // crawlShard は自分のエラーをレポートに書いて返すが、レポートの書き出し自体の失敗などで
        // 投げられても、他のワーカーを止めない（Promise.all が失敗するとブラウザを閉じてしまうため）
        options.log?.(`ワーカー ${workerNo}: ${shard.id} の結果を残せませんでした: ${errorMessage(e)}`);
        failures.push(`${shard.id}（${errorMessage(e)}）`);
        continue;
      }
      reports.push(report);
      options.log?.(
        `ワーカー ${workerNo}: ${shard.id} を終了（状態 ${report.stats.states}・操作 ${report.stats.actions}・疑い ${report.findings.length}）`
      );
    }
  };

  try {
    await Promise.all(Array.from({ length: workerCount }, (_, i) => worker(i + 1)));
  } finally {
    if (!options.browser) await browser.close();
  }

  // 同じ出力先で別々に実行した担当範囲の結果も含めてまとめる（サブエージェントでの分担を想定）
  const allReports = await readShardReports(options.outDir);
  const merged = mergeReports(allReports, config.seed);
  const files = await writeMergedReport(options.outDir, merged);
  return { reports, merged, files, failures };
}
