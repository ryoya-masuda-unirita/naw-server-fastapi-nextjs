// 用途: npm run build:prod / ng build (本番ビルド)
// ALB/nginxが /api/* と /auth/* をバックエンドに転送する構成を前提とする。
export const environment = {
  production: true,
  apiBaseUrl: 'https://api.secuaigent.com/api',
  authBaseUrl: 'https://api.secuaigent.com',
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
