variable "bastion_sg_id" {
  type        = string
  description = "踏み台のセキュリティグループID"
}

variable "key_pair_name" {
  type        = string
  description = "bastionへのSSH接続に使うキーペア名"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "public_subnet_id" {
  type        = string
  description = "踏み台を置くpublicサブネットのID"
}
