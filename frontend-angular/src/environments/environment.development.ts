// 用途: npm run dev (proxy.conf.dev.js 経由で FastAPI localhost:8001 に接続)
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  authBaseUrl: '',
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
