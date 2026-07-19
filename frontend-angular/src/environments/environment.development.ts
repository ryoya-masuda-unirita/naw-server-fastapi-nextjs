// 用途: npm run dev (開発環境・実バックエンド接続)
// 開発サーバーに接続するとき。
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  authBaseUrl: '',
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
