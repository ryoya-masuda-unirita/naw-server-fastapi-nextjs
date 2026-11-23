variable "elasticache_sg_id" {
  type        = string
  description = "ElastiCacheのセキュリティグループID"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "privateサブネットのIDのリスト"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "engine_version" {
  type        = string
  default     = "7.1"
  description = "Redisのバージョン"
}
