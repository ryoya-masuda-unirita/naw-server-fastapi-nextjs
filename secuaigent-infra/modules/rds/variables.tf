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
