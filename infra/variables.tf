variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "project_name" {
  type    = string
  default = "naw-fastapi-issue160"
}

variable "db_password" {
  type      = string
  sensitive = true
}

