// /backend/auth/* ビヘイビア(ALB)のviewer-requestで動くCloudFront Function(cloudfront-js-2.0)。
// Reactの画面 /auth/login 等とbackendの認証API(POST /auth/login 等)は同じパスのため、
// フロントは認証APIを /backend を付けて呼び(.env.productionのVITE_AUTH_API_URL)、ここで外してbackendへ渡す(#240)。
// backendには移植元と同じ /auth/... のパスで届く。
var BACKEND_PREFIX = '/backend';

function handler(event) {
  var request = event.request;
  if (request.uri.indexOf(BACKEND_PREFIX + '/') === 0) {
    request.uri = request.uri.substring(BACKEND_PREFIX.length);
  }
  return request;
}
