import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { envDown, envUp, EnvironmentError } from './environment.ts';
import { MODULE_ROOT, REPORT_DIR } from './env.ts';
import { loadCatalog } from './reporter/catalog.ts';
import { scanWrittenIds, writeReports } from './reporter/spec-reporter.ts';
import { mergeRunResults, type RunResults } from './reporter/summary.ts';

/**
 * コマンドの入口。
 *   run       専用環境の起動 → テスト → 集計 → 破棄（1 コマンド）
 *   env:up    専用環境の起動（seed まで）
 *   env:down  専用環境の破棄（データごと）
 *   report    出力先の results.json から集計を作り直す（テストファイルの追加を反映する）
 *   merge     複数の results.json を 1 つの集計にまとめる
 *
 * テストだけ流すときは、起動済みの環境に対して `npm test`（playwright test）。
 */

const USAGE = `使い方: node src/cli.ts <run|env:up|env:down|report|merge> [オプション] [-- playwright のオプション]

  run [--keep-env] [-- <playwright のオプション>]   起動 → テスト → 集計 → 破棄
  env:up                                            専用環境の起動
  env:down                                          専用環境の破棄
  report                                            集計の作り直し（E2E_SPEC_REPORT_DIR の results.json）
  merge <results.json>... [--out <dir>]             複数の結果をまとめる（既定の出力先: reports/merged）
`;

function log(message: string): void {
  console.log(`${new Date().toISOString().slice(11, 19)} ${message}`);
}

function readResults(file: string): RunResults {
  if (!existsSync(file)) throw new Error(`${file} がありません`);
  return JSON.parse(readFileSync(file, 'utf-8')) as RunResults;
}

/** Playwright を子プロセスで流し、終了コードを返す。NG があっても集計は出すので、失敗でも止めない。 */
function runPlaywright(extraArgs: string[]): number {
  const result = spawnSync('npx', ['playwright', 'test', ...extraArgs], { cwd: MODULE_ROOT, stdio: 'inherit' });
  return result.status ?? 1;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const separator = argv.indexOf('--');
  const ownArgs = separator === -1 ? argv.slice(1) : argv.slice(1, separator);
  const passThrough = separator === -1 ? [] : argv.slice(separator + 1);
  const { values, positionals } = parseArgs({
    args: ownArgs,
    allowPositionals: true,
    options: { 'keep-env': { type: 'boolean' }, out: { type: 'string' } },
  });

  switch (command) {
    case 'run': {
      await envUp(log);
      try {
        return runPlaywright(passThrough);
      } finally {
        if (values['keep-env']) log('--keep-env のため専用環境を残します（npm run env:down で破棄）');
        else envDown(log);
        log(`集計: ${path.join(REPORT_DIR, 'summary.md')}`);
      }
    }
    case 'env:up':
      await envUp(log);
      return 0;
    case 'env:down':
      envDown(log);
      return 0;
    case 'report': {
      const current = readResults(path.join(REPORT_DIR, 'results.json'));
      writeReports({ ...current, written: scanWrittenIds() }, REPORT_DIR);
      log(`集計を作り直しました: ${path.join(REPORT_DIR, 'summary.md')}（項目書 ${loadCatalog().length} カテゴリ）`);
      return 0;
    }
    case 'merge': {
      if (positionals.length === 0) throw new Error('まとめる results.json を 1 つ以上指定してください');
      const outDir = path.resolve(MODULE_ROOT, values.out ?? path.join('reports', 'merged'));
      writeReports(mergeRunResults(positionals.map((p) => readResults(path.resolve(p)))), outDir);
      log(`まとめました: ${path.join(outDir, 'summary.md')}`);
      return 0;
    }
    default:
      console.log(USAGE);
      return command ? 1 : 0;
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof EnvironmentError || error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
