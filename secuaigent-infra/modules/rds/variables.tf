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

  // パラメータグループのファミリ(postgres<メジャー>)を、この値の先頭の数字から決める。形式が崩れると、
  // ファミリが不正になり、planで分かりにくいエラーになるため、ここで先に弾く。
  validation {
    condition     = can(regex("^[0-9]+(\\.[0-9]+)?$", var.engine_version))
    error_message = "engine_version は、メジャー(例: 18)、またはメジャー.マイナー(例: 18.6)の形式で指定すること。"
  }
}

variable "backup_retention_period" {
  type        = number
  default     = 7
  description = "自動バックアップの保持日数"
}
