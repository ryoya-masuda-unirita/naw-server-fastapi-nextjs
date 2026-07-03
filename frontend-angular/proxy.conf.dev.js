// naw-server-fastapi-nextjs の FastAPI 開発サーバー
const DEV_SERVER = 'http://localhost:8001';

module.exports = {
  '/api': {
    target: DEV_SERVER,
    secure: false,
    changeOrigin: true,
  },
  '/auth': {
    target: DEV_SERVER,
    secure: false,
    changeOrigin: true,
    bypass: function (req) {
      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        return '/index.html';
      }
    },
  },
};
