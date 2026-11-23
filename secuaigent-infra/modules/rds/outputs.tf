// RDSのホスト名
output "address" {
  value = aws_db_instance.main.address
}

// RDSのマスターユーザー名
output "username" {
  value = aws_db_instance.main.username
}

// RDSのデータベース名
output "db_name" {
  value = aws_db_instance.main.db_name
}

// 生成したマスターパスワード。secretsモジュールが接続文字列に埋め込んで、Secrets Managerに保存する
output "master_password" {
  value     = random_password.master.result
  sensitive = true
}
