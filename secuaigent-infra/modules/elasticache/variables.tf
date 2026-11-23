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
  description = "Redisのバージョン。保存時の暗号化・通信の暗号化と同様、変えるとレプリケーショングループの再作成になることがある(キャッシュの中身は消え、エンドポイントも変わる)。セッションを保持しているため、変更は計画して行うこと"
}
