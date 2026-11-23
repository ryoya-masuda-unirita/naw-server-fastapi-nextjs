// フロントエンド配信・APIリバースプロキシを兼ねるCloudFrontディストリビューション
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  default_root_object = "index.html"
  // PriceClass_100は北米・欧州のエッジのみ使用（最も安価。日本のエッジは使わないがコスト優先）
  price_class = "PriceClass_100"

  // オリジン1: S3(フロントエンドの静的ファイル)。OAC経由でアクセスする
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  // オリジン2: ALB(backend API)。CloudFront→ALB間はHTTPで通信する
  origin {
    domain_name = var.alb_dns_name
    origin_id   = "alb-backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  // デフォルトビヘイビア: S3(フロントエンド)へ
  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    // SPAのため、画面パス(拡張子なし)はindex.htmlに書き換えてからS3へ取りに行く。
    // custom_error_responseはディストリビューション全体(ALBのAPI応答を含む)に効くため使わない(#240)
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_fallback.arn
    }
  }

  // /api/* はALB(backend)へ
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0
  }

  // 認証API(/auth/*)はReactの画面(/auth/login 等)と同じパスのため、フロントは /backend を付けて呼ぶ
  // (frontend/.env.production の VITE_AUTH_API_URL)。ここでALB(backend)へ転送し、関数で /backend を外す(#240)。
  // /auth/* 自体はS3(デフォルトビヘイビア)で画面として配信する
  ordered_cache_behavior {
    path_pattern           = "/backend/auth/*"
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]

    forwarded_values {
      query_string = true
      headers      = ["*"]
      cookies {
        forward = "all"
      }
    }
    min_ttl     = 0
    default_ttl = 0
    max_ttl     = 0

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.strip_backend_prefix.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  // 独自ドメインを廃止したため、CloudFrontのデフォルトドメイン（*.cloudfront.net）・
  // デフォルト証明書で配信する（ACM証明書は不要）。
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name = "${var.project_name}-cf"
  }
}

// S3(フロントエンド)ビヘイビア用: 画面パス(拡張子なし)をindex.htmlに書き換える(SPAフォールバック)。
// コードは単体テスト(functions/functions.test.mjs)から同じファイルを読むため、別ファイルにしている
resource "aws_cloudfront_function" "spa_fallback" {
  name    = "${var.project_name}-spa-fallback"
  runtime = "cloudfront-js-2.0"
  comment = "SPA fallback: rewrite extensionless paths to /index.html"
  publish = true
  code    = file("${path.module}/functions/spa_fallback.js")
}

// /backend/auth/* ビヘイビア用: /backend を外してbackendへ /auth/... で渡す
resource "aws_cloudfront_function" "strip_backend_prefix" {
  name    = "${var.project_name}-strip-backend-prefix"
  runtime = "cloudfront-js-2.0"
  comment = "Strip /backend prefix before forwarding auth API requests to ALB"
  publish = true
  code    = file("${path.module}/functions/strip_backend_prefix.js")
}

// フロントエンド(SPA)の静的ファイルを置くS3バケット
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend"

  // 中身が空でないとterraform destroyが失敗するため、destroy時にオブジェクトごと削除させる
  force_destroy = true

  tags = {
    Name = "${var.project_name}-frontend"
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

// CloudFront(OAC)からのアクセスのみを許可するバケットポリシー(S3はポリシーを直接アタッチ可能)
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontServicePrincipal"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
        }
      }
    }]
  })
}
