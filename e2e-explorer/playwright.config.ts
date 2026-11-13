import { defineConfig, devices } from '@playwright/test';

/**
 * ハーネス自体の単体テスト用の設定。
 * 巡回（npm run explore）はこの設定を使わず、src/cli.ts が直接ブラウザを起動する。
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.test.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    ...devices['Desktop Chrome'],
  },
});
