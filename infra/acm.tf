// CloudFront用のACM証明書。CloudFrontはus-east-1の証明書しか使えないためエイリアスプロバイダを指定
resource "aws_acm_certificate" "main" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name    = "${var.project_name}-cert"
    Project = var.project_name
  }
}

// ACMが要求するDNS検証用レコードをRoute53に自動作成する。
// ベースドメインとワイルドカードは検証用CNAMEが同一名・同一値になるため、resource_record_nameをキーにして
// 1レコード1リソースに集約する（domain_nameキーで2リソースに分けると、同一レコードを2つのリソースが
// 取り合う形になり、destroy時に片方がNotFoundで失敗しうるため）。
// ...(ellipsis)で同一キーの値をリストにグルーピングし、先頭要素（内容は全て同じ）だけを使う。
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.resource_record_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }...
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value[0].name
  type    = each.value[0].type
  records = [each.value[0].record]
  ttl     = 60
  // ホストゾーンに既存の同名レコードがあっても上書きする
  allow_overwrite = true
}

// DNS検証が完了するまで待つ（この完了後にCloudFrontで証明書が使えるようになる）
resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
