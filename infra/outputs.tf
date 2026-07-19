// ムームードメインのネームサーバー設定に登録する4つのNSレコード
output "route53_name_servers" {
  value = aws_route53_zone.main.name_servers
}

// CloudFrontのドメイン名（動作確認時にアクセスする）
output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

// ALBのDNS名（直接疎通確認する場合に使う）
output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

// RDSの接続先エンドポイント
output "rds_endpoint" {
  value = aws_db_instance.main.address
}

// ECRリポジトリのURL（docker pushの向き先）
output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

// bastionのパブリックIP（SSH接続先）
output "bastion_public_ip" {
  value = aws_instance.bastion.public_ip
}
