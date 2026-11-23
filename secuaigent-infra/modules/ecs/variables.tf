variable "cloudfront_domain_name" {
  type        = string
  description = "CORSで許可するCloudFrontのドメイン名"
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

variable "private_subnet_ids" {
  type        = list(string)
  description = "backendのタスクを置くprivateサブネットのIDのリスト(外向きの通信はNAT経由)"
}

variable "redis_endpoint" {
  type        = string
  description = "ElastiCacheのプライマリエンドポイント"
}

variable "region" {
  type        = string
  description = "AWSリージョン"
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

variable "cpu" {
  type        = number
  default     = 512
  description = "Fargateタスクに割り当てるCPU(CPUユニット。512=0.5vCPU)"
}

variable "memory" {
  type        = number
  default     = 1024
  description = "Fargateタスクに割り当てるメモリ(MiB)"
}

variable "health_check_grace_period_seconds" {
  type        = number
  default     = 240
  description = "サービス起動直後にALBのヘルスチェック失敗を無視する秒数"
}

variable "secret_arn" {
  type        = string
  description = "DB接続文字列・秘密鍵を持つSecrets ManagerのシークレットのARN(タスク定義のsecretsと、実行ロールの権限に使う)"
}
