// バックエンドの転送先。docker-compose経由で起動する場合、コンテナ間通信用のアドレス
// （例: http://backend:8000）を環境変数BACKEND_PROXY_TARGETで注入する。未設定時は
// ホストで直接 `npm start` する既存の運用に合わせ、localhost:8001にフォールバックする。
const backendTarget = process.env.BACKEND_PROXY_TARGET || 'http://localhost:8001';

module.exports = {
  '/api': {
    target: backendTarget,
    secure: false,
    changeOrigin: true,
  },
  '/auth': {
    target: backendTarget,
    secure: false,
    changeOrigin: true,
    // ブラウザのページナビゲーション（Accept: text/html）はAngularに返す
    // API呼び出し（POST /auth/login 等）はバックエンドに転送する
    // /auth/login はAngularのページURL兼APIのパスです。ブラウザがページ遷移で GET /auth/login をリクエストするとき（Accept: text/html）はバックエンドに転送せず Angular の index.html を返します。POST /auth/login などのAPI呼び出しはそのままバックエンドへ転送します。
    bypass: function (req) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return '/index.html';
      }
    },
  },
};
