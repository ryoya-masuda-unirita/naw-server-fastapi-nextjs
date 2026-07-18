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
  type      = string
  sensitive = true
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "踏み台へのSSH接続を許可するCIDRブロックのリスト"
}