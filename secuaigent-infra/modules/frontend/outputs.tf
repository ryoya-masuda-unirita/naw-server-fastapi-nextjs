// CloudFrontのドメイン名
output "domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

// CloudFrontの配信ID
output "distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

// CloudFrontディストリビューションのARN
output "distribution_arn" {
  value = aws_cloudfront_distribution.main.arn
}

// フロントエンド配信用S3バケット名
output "bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

// フロントエンド配信用S3バケットのARN
output "bucket_arn" {
  value = aws_s3_bucket.frontend.arn
}
