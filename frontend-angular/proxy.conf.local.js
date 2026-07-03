module.exports = {
  '/api': {
    target: 'http://localhost:8080',
    secure: false,
    changeOrigin: true,
  },
  '/auth': {
    target: 'http://localhost:8080',
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
