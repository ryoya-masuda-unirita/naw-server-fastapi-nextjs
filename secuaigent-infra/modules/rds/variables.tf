variable "db_password" {
  type        = string
  description = "RDSのマスターパスワード"
  sensitive   = true
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "privateサブネットのIDのリスト"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "rds_sg_id" {
  type        = string
  description = "RDSのセキュリティグループID"
}

variable "engine_version" {
  type        = string
  default     = "18"
  description = "PostgreSQLのバージョン。メジャーのみ指定する(マイナーはAWSに任せる)。ローカルの開発環境(postgres:18)と合わせている"
}

variable "backup_retention_period" {
  type        = number
  default     = 7
  description = "自動バックアップの保持日数"
}
