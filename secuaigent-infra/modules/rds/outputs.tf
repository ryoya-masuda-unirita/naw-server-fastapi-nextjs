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
