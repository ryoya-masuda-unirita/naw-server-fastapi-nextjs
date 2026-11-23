variable "db_address" {
  type        = string
  description = "RDSのホスト名"
}

variable "db_name" {
  type        = string
  description = "RDSのデータベース名"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "RDSのマスターパスワード(rdsモジュールが生成したもの)"
}

variable "db_username" {
  type        = string
  description = "RDSのマスターユーザー名"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}
