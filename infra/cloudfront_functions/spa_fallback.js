// S3(フロントエンド)ビヘイビアのviewer-requestで動くCloudFront Function(cloudfront-js-2.0)。
// React RouterのSPAは /dashboard や /auth/login などの画面パスに対応するオブジェクトをS3に持たないため、
// 拡張子のないパスはindex.htmlに書き換えてSPA側でルーティングさせる(#240)。
// 以前はディストリビューション全体のcustom_error_responseで403/404をindex.htmlに置き換えていたが、
// それだとbackend(ALB)のAPIが返す403/404までHTML(200)に置き換わるため、S3ビヘイビアだけに効くこの関数にした。
// 拡張子のあるパス(JS・CSS・翻訳JSONなど)は書き換えず、存在しなければS3のエラーをそのまま返す
// (HTMLをJSとして読み込むのを防ぐ)。
function handler(event) {
  var request = event.request;
  var lastSegment = request.uri.substring(request.uri.lastIndexOf('/') + 1);
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
