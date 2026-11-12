import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  assertSafeTarget,
  ConfigError,
  DEFAULT_CONFIG_PATH,
  expandShards,
  loadConfig,
  MODULE_ROOT,
  selectShards,
  type CliOverrides,
  type ExplorerConfig,
  type Shard,
} from './config.ts';
import { envDown, envUp, EnvironmentError } from './environment.ts';
import { mergeReports, readShardReports, writeMergedReport } from './report.ts';
import { runShards } from './scheduler.ts';

/**
 * コマンドの入口。
 *   run       専用環境の起動 → 巡回 → まとめ → 破棄（1 コマンド）
 *   explore   起動済みの専用環境に対して巡回する
 *   env:up / env:down   専用環境の起動（テナント作成まで）/ 破棄
 *   merge     出力先の担当範囲ごとの結果をまとめ直す
 *   shards    担当範囲の一覧
 */

const USAGE = `使い方: node src/cli.ts <run|explore|env:up|env:down|merge|shards> [オプション]

  --shard <ID>               担当範囲を指定（複数可。省略時は全部）
  --out <dir>                出力先（既定: reports/<日時>）
  --workers <n>              並列数（既定: 設定の workers）
  --seed <n>                 乱数の種
  --max-depth <n>            深さの上限
  --max-actions <n>          担当範囲ごとの操作回数の上限
  --max-minutes <n>          担当範囲ごとの時間の上限（分）
  --config <file>            設定ファイル（既定: explorer.config.json）
  --keep-env                 run の後に専用環境を残す
  --no-shared-registry       共通領域の調査済みの一覧を使わない
  --headed                   ブラウザを表示する
  --allow-non-local-target   ローカル以外の URL に向けることを許す（通常は使わない）
`;

function log(message: string): void {
  console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);
}

function toNumber(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ConfigError(`--${name} は数で指定してください: ${value}`);
  return n;
}

function defaultOutDir(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return path.join(MODULE_ROOT, 'reports', stamp);
}

function printShards(config: ExplorerConfig, shards: Shard[]): void {
  console.log('担当範囲（ID = 画面のまとまり-権限）');
  for (const s of shards) {
    console.log(
      `- ${s.id}\n    まとまり: ${s.groupId}（${s.description}）\n    権限: ${s.role}（${config.roles[s.role].description ?? ''}）` +
        `\n    起点: ${s.startPath}\n    範囲: ${s.include.map((r) => r.source).join(' | ')}\n    テナント: ${s.tenantId ?? '(ログインしない)'}`
    );
  }
}

async function explore(config: ExplorerConfig, shards: Shard[], outDir: string, values: Record<string, unknown>): Promise<void> {
  log(`巡回を始めます: ${shards.map((s) => s.id).join(', ')}（並列数 ${config.workers}・種 ${config.seed}）`);
  log(`出力先: ${outDir}`);
  const result = await runShards(config, shards, {
    outDir,
    workers: config.workers,
    headed: !!values.headed,
    noSharedRegistry: !!values['no-shared-registry'],
    log,
  });
  const t = result.merged.totals;
  log(`疑い ${t.groups} 件（発生 ${t.occurrences} 回 / 高 ${t.bySeverity.high}・中 ${t.bySeverity.medium}・低 ${t.bySeverity.low}）`);
  log(`レポート: ${result.files.markdown}`);
  log(`         ${result.files.html}`);
  log(`         ${result.files.json}`);
  const failed = result.reports.filter((r) => r.error);
  if (failed.length > 0) {
    throw new EnvironmentError(`途中で止まった担当範囲があります: ${failed.map((r) => `${r.shardId}（${r.error}）`).join(', ')}`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      shard: { type: 'string', multiple: true },
      out: { type: 'string' },
      workers: { type: 'string' },
      seed: { type: 'string' },
      'max-depth': { type: 'string' },
      'max-actions': { type: 'string' },
      'max-minutes': { type: 'string' },
      config: { type: 'string' },
      'keep-env': { type: 'boolean' },
      'no-shared-registry': { type: 'boolean' },
      headed: { type: 'boolean' },
      'allow-non-local-target': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const command = positionals[0];
  if (!command || values.help) {
    console.log(USAGE);
    return;
  }

  const overrides: CliOverrides = {
    workers: toNumber(values.workers, 'workers'),
    seed: toNumber(values.seed, 'seed'),
    maxDepth: toNumber(values['max-depth'], 'max-depth'),
    maxActions: toNumber(values['max-actions'], 'max-actions'),
    maxMinutes: toNumber(values['max-minutes'], 'max-minutes'),
  };
  const config = loadConfig(values.config ? path.resolve(values.config) : DEFAULT_CONFIG_PATH, overrides);
  const shards = selectShards(expandShards(config), values.shard ?? []);
  const outDir = path.resolve(values.out ?? defaultOutDir());

  switch (command) {
    case 'shards':
      printShards(config, shards);
      return;
    case 'env:up':
      assertSafeTarget(config, !!values['allow-non-local-target']);
      await envUp(config, shards, log);
      return;
    case 'env:down':
      envDown(config, log);
      return;
    case 'merge': {
      if (!values.out) throw new ConfigError('merge には --out で出力先を指定してください');
      const reports = await readShardReports(outDir);
      if (reports.length === 0) throw new ConfigError(`担当範囲の結果がありません: ${outDir}/shards/*/shard-report.json`);
      const files = await writeMergedReport(outDir, mergeReports(reports, config.seed));
      log(`まとめました（${reports.length} 担当範囲）: ${files.markdown}`);
      return;
    }
    case 'explore':
      assertSafeTarget(config, !!values['allow-non-local-target']);
      await explore(config, shards, outDir, values);
      return;
    case 'run': {
      assertSafeTarget(config, !!values['allow-non-local-target']);
      try {
        await envUp(config, shards, log);
        await explore(config, shards, outDir, values);
      } finally {
        if (values['keep-env']) log('--keep-env のため専用環境を残します（npm run env:down で破棄）');
        else envDown(config, log);
      }
      return;
    }
    default:
      console.log(USAGE);
      throw new ConfigError(`不明なコマンドです: ${command}`);
  }
}

main().catch((e: unknown) => {
  const known = e instanceof ConfigError || e instanceof EnvironmentError;
  console.error(known ? `エラー: ${(e as Error).message}` : e);
  process.exitCode = 1;
});
