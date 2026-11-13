import { defineConfig } from 'vitest/config';
import path from 'path';

// server-local（onprem/）を実際に起動して、ブラウザからの送信の通しを確かめる手動用の設定（#289）。
// 通常の `npm test` には含めない。手順は src/features/chat/README.md。
// jsdom の Blob は fetch に渡すと本文が空になるため、node 環境で動かす。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['e2e-local/**/*.e2e.ts'],
    setupFiles: ['./e2e-local/node-browser-stubs.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
