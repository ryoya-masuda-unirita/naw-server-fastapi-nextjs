// Angular のデフォルトファイル（直接使用しない）
// 各環境は fileReplacements でこのファイルを差し替える。
//   development → environment.development.ts
//   local       → environment.local.ts
//   production  → environment.production.ts
export const environment = {
  production: false,
  /** 相対パスは `ng serve --configuration local` の proxy（`proxy.conf.local.js`）でバックエンドへ転送 */
  apiBaseUrl: '/api',
  authBaseUrl: '/auth',
  /** ローカル実 API 接続時は `environment.local.ts`（enableMock: false）を使うこと */
  enableMock: false,
  minPasswordLength: 8,
  maxPasswordLength: 64,
};
