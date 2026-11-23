// backendが使う機密情報(DB接続文字列・秘密鍵)をまとめるSecrets Managerのシークレット。
// ECSのタスク定義には値を持たせず、タスクの起動時に実行ロールがここから取り出して環境変数として注入する。
//
// 値はTerraformが生成・保存する(移植元は、プレースホルダを置いてapply後に手動で差し替える)。
// DBのパスワードは、RDSの作成時に先に決まっていなければならないため。値はtfstateにも残る(非公開・暗号化のバケット)。

// アプリの秘密鍵。記号を含めないのは、環境変数として扱いやすくするため。
resource "random_password" "secret_key" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "backend" {
  name = "${var.project_name}/backend"

  // 開発用なので、削除待ちを設けない(destroy後に、同じ名前で作り直せるようにする)
  recovery_window_in_days = 0

  tags = {
    Name = "${var.project_name}/backend"
  }
}

resource "aws_secretsmanager_secret_version" "backend" {
  secret_id = aws_secretsmanager_secret.backend.id

  secret_string = jsonencode({
    // アプリ(server/)がそのまま使う接続文字列。ECSがこのキーを、同名の環境変数として注入する
    DATABASE_URL = "postgresql+asyncpg://${var.db_username}:${var.db_password}@${var.db_address}:5432/${var.db_name}"
    // アプリの秘密鍵
    SECRET_KEY = random_password.secret_key.result
    // 人がDBに接続するとき(踏み台からのシード投入など)の取得元。アプリは使わない
    DB_PASSWORD = var.db_password
  })
}
