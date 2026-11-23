// CloudFrontのドメイン名（動作確認時にアクセスする）
output "cloudfront_domain_name" {
  value = module.frontend.domain_name
}

// CloudFrontの配信ID（GitHub ActionsのCLOUDFRONT_DISTRIBUTION_ID変数・キャッシュ無効化コマンドに使う）
output "cloudfront_distribution_id" {
  value = module.frontend.distribution_id
}

// フロントエンド配信用S3バケット名（GitHub ActionsのFRONTEND_BUCKET_NAME変数に使う）
output "frontend_bucket_name" {
  value = module.frontend.bucket_name
}

// GitHub ActionsがAssumeRoleするIAMロールのARN（GitHub ActionsのAWS_ROLE_ARNシークレットに使う）
output "github_actions_role_arn" {
  value = module.github_actions.role_arn
}

// ALBのDNS名（直接疎通確認する場合に使う）
output "alb_dns_name" {
  value = module.alb.dns_name
}

// RDSの接続先エンドポイント
output "rds_endpoint" {
  value = module.rds.address
}

// ECRリポジトリのURL（docker pushの向き先）
output "ecr_repository_url" {
  value = module.ecr.repository_url
}

// bastionのパブリックIP（SSH接続先）
output "bastion_public_ip" {
  value = module.bastion.public_ip
}

// ユーザーインポート用S3バケット名（動作確認時に使う）
output "user_import_bucket_name" {
  value = module.user_import.bucket_name
}

// ユーザーインポート用SQSキューURL（動作確認時に使う）
output "user_import_queue_url" {
  value = module.user_import.queue_url
}

// backendの機密情報を持つSecrets Managerのシークレット名(踏み台からのシード投入など、人がDBのパスワードを取得するときに使う)
output "backend_secret_name" {
  value = module.secrets.secret_name
}
