// 用途: npm run dev (開発環境・実バックエンド接続)
// 開発サーバーに接続するとき。
export const environment = {
  production: false,
  apiBaseUrl: 'https://dev-api.secuaigent.com/api',
  authBaseUrl: 'https://dev-api.secuaigent.com',
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
