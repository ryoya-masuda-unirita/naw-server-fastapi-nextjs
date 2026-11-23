variable "alb_dns_name" {
  type        = string
  description = "CloudFrontのオリジンにするALBのDNS名"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}
