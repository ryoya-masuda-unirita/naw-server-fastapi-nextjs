import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { BASE_URL, REPORT_DIR } from './src/env.ts';

const DEFAULT_WORKERS = 2;

/**
 * 結合テスト項目書に沿った E2E の設定。
 * 実行先（BASE_URL）は専用環境。起動は `npm run env:up`、1 コマンドなら `npm run spec:all`。
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // 失敗を再実行でごまかさない（NG は NG として数える）
  retries: 0,
  // 専用環境の backend は 1 つなので、4 並列だと負荷で応答が遅れ、要素待ちのタイムアウトや API の 500・切断が出る（#397）。
  workers: Number(process.env.E2E_SPEC_WORKERS ?? DEFAULT_WORKERS),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['./src/reporter/spec-reporter.ts']],
  // スクリーンショット・trace は集計と同じディレクトリに置く。出力先（E2E_SPEC_REPORT_DIR）を変えれば、同じモジュールで同時に流しても衝突しない
  outputDir: path.join(REPORT_DIR, 'test-results'),
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 画面の文言は日本語（i18n の既定）で確かめる
    locale: 'ja-JP',
  },
});
