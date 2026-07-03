// TODO: 開発サーバーのURLを設定すること
const DEV_SERVER = 'http://TODO_DEV_SERVER_URL';

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
