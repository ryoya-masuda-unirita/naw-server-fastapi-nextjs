// ムームードメインのネームサーバー設定に登録する4つのNSレコード
output "name_servers" {
  value = aws_route53_zone.main.name_servers
}
