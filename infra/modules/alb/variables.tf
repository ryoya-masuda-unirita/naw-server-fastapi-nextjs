variable "alb_sg_id" {
  type        = string
  description = "ALBのセキュリティグループID"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "publicサブネットのIDのリスト"
}

variable "vpc_id" {
  type        = string
  description = "ALBを置くVPCのID"
}
