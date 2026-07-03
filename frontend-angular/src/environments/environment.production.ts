// 用途: npm run build:prod / ng build (本番ビルド)
// リバースプロキシが /api/* と /auth/* を FastAPI に転送する構成を前提とする。
export const environment = {
  production: true,
  apiBaseUrl: '/api',
  authBaseUrl: '/auth',
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
