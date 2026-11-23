// シークレットのARN。ECSのタスク定義(secrets)と、実行ロールの権限に使う
output "secret_arn" {
  value = aws_secretsmanager_secret.backend.arn
}

// シークレットの名前。踏み台からのシード投入など、人がパスワードを取得するときに使う
output "secret_name" {
  value = aws_secretsmanager_secret.backend.name
}
