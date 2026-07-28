variable "region" {
  type    = string
  default = "ap-northeast-1"
}

// デフォルトがあればそのまま使える｡デフォルトがなければ､terraform.tfvarsで指定する必要がある｡
variable "project_name" {
  type    = string
  default = "naw-fastapi-issue160"
}

variable "db_password" {
  type = string
  // シークレットなデータを扱う場合はsensitive = trueを指定する
  sensitive = true
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "踏み台へのSSH接続を許可するCIDRブロックのリスト"
}

variable "allowed_admin_cidrs" {
  type        = list(string)
  description = "管理サーバーへの接続を許可するCIDRブロックのリスト"
}

variable "key_pair_name" {
  type        = string
  description = "bastionへのSSH接続に使うキーペア名"
}

variable "secret_key" {
  type        = string
  sensitive   = true
  description = "backendのSECRET_KEY"
}