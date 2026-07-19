// ドメインのDNS管理をRoute53で行うためのホストゾーン。
// 作成後に発行されるNSレコードを、ムームードメインのネームサーバー設定に手動登録する必要がある。
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = {
    Name    = "${var.project_name}-zone"
    Project = var.project_name
  }
}