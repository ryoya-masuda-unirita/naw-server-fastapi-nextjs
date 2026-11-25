import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// 管理用 API は、エミュレーターに中継する（エミュレーター側に CORS の設定を足さないため）
// localhost は IPv6 に解決されて届かない環境があるため、IPv4 のアドレスを使う
const DEFAULT_WAHA_URL = 'http://127.0.0.1:8091';
const DEV_HOST = '127.0.0.1';
const DEV_PORT = 5174;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: DEV_HOST,
      port: DEV_PORT,
      proxy: {
        '/admin': env.WAHA_URL || DEFAULT_WAHA_URL,
      },
    },
  };
});
