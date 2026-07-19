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
// ベースドメインとワイルドカードは検証用CNAMEが同一名・同一値になる。domain_nameをキーにすると2エントリだが、
// allow_overwrite=trueで同じレコードをUPSERT（冪等）するため、重複エラーにならない（HashiCorp公式パターン）。
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.main.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
  // 既存の検証レコードがあっても上書きする（重複作成エラーを防ぐ）
  allow_overwrite = true
}

// DNS検証が完了するまで待つ（この完了後にCloudFrontで証明書が使えるようになる）
resource "aws_acm_certificate_validation" "main" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}
