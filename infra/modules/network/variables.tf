variable "allowed_admin_cidrs" {
  type        = list(string)
  description = "管理サーバーへの接続を許可するCIDRブロックのリスト"
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "踏み台へのSSH接続を許可するCIDRブロックのリスト"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}
