// フロントエンド(SPA)の静的ファイルを置くS3バケット
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend"

  tags = {
    Name    = "${var.project_name}-frontend"
    Project = var.project_name
  }
}

// バケットへのパブリックアクセスを全面的にブロックする（CloudFront経由のみアクセス可にするため）
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

// CloudFrontがS3に安全にアクセスするための仕組み(Origin Access Control)
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
