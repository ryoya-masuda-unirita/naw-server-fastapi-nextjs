import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './src/env.ts';

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
  workers: Number(process.env.E2E_SPEC_WORKERS ?? 4),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['./src/reporter/spec-reporter.ts']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // 画面の文言は日本語（i18n の既定）で確かめる
    locale: 'ja-JP',
  },
});
