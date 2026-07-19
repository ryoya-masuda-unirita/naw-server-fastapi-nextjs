variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "project_name" {
  type    = string
  default = "naw-fastapi-issue160"
}

variable "domain_name" {
  type        = string
  description = "ムームードメインで取得したドメイン名"
}
