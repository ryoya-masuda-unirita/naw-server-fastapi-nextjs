// CloudFrontのドメイン名（動作確認時にアクセスする）
output "cloudfront_domain_name" {
  value = aws_cloudfront_distribution.main.domain_name
}

// CloudFrontの配信ID（GitHub ActionsのCLOUDFRONT_DISTRIBUTION_ID変数・キャッシュ無効化コマンドに使う）
output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

// フロントエンド配信用S3バケット名（GitHub ActionsのFRONTEND_BUCKET_NAME変数に使う）
output "frontend_bucket_name" {
  value = aws_s3_bucket.frontend.bucket
}

// GitHub ActionsがAssumeRoleするIAMロールのARN（GitHub ActionsのAWS_ROLE_ARNシークレットに使う）
output "github_actions_role_arn" {
  value = aws_iam_role.github_actions.arn
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

// ユーザーインポート用S3バケット名（動作確認時に使う）
output "user_import_bucket_name" {
  value = aws_s3_bucket.user_import.bucket
}

// ユーザーインポート用SQSキューURL（動作確認時に使う）
output "user_import_queue_url" {
  value = aws_sqs_queue.user_import.url
}
