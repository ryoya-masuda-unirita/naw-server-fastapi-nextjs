/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import angular from '@analogjs/vite-plugin-angular'; // Angular コンパイル対応
import tsconfigPaths from 'vite-tsconfig-paths'; // @core/* 等のパスエイリアスを解決

export default defineConfig({
  plugins: [angular(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'happy-dom', // jsdom より window.location 等の制約が緩い
    setupFiles: ['vitest.setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      enabled: false, // 拡張機能実行時に自動でカバレッジが走らないよう無効化
    },
  },
});
