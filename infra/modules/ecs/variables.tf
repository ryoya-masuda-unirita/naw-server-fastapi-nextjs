variable "cloudfront_domain_name" {
  type        = string
  description = "CORSで許可するCloudFrontのドメイン名"
}

variable "db_password" {
  type        = string
  description = "RDSのマスターパスワード"
  sensitive   = true
}

variable "ecr_repository_url" {
  type        = string
  description = "backendイメージのECRリポジトリURL"
}

variable "ecs_sg_id" {
  type        = string
  description = "ECSのセキュリティグループID"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "publicサブネットのIDのリスト"
}

variable "rds_address" {
  type        = string
  description = "RDSのホスト名"
}

variable "rds_db_name" {
  type        = string
  description = "RDSのデータベース名"
}

variable "rds_username" {
  type        = string
  description = "RDSのマスターユーザー名"
}

variable "redis_endpoint" {
  type        = string
  description = "ElastiCacheのプライマリエンドポイント"
}

variable "region" {
  type        = string
  description = "AWSリージョン"
}

variable "secret_key" {
  type        = string
  description = "backendのSECRET_KEY"
  sensitive   = true
}

variable "target_group_arn" {
  type        = string
  description = "backendを登録するALBターゲットグループのARN"
}

variable "user_import_bucket_arn" {
  type        = string
  description = "ユーザーインポート用S3バケットのARN"
}

variable "user_import_bucket_name" {
  type        = string
  description = "ユーザーインポート用S3バケット名"
}

variable "user_import_queue_arn" {
  type        = string
  description = "ユーザーインポート用SQSキューのARN"
}

variable "user_import_queue_url" {
  type        = string
  description = "ユーザーインポート用SQSキューのURL"
}
