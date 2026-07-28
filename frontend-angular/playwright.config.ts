import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // ローカルの単一Postgresコンテナに対してテストを実行するため、コア数分のワーカーが
  // 同時接続してコネクションプール枯渇を起こさないよう上限を設ける。
  workers: 4,
  retries: 0,
  reporter: 'html',
  expect: {
    timeout: 8000,
  },
  use: {
    baseURL: 'http://localhost:4201',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
