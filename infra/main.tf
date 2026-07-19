terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region  = var.region
  profile = "naw-fastapi-issue158"
}

provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "naw-fastapi-issue158"
}

// route53サブディレクトリ(別state)で作成済みのホストゾーンを、ドメイン名で参照する（作成はしない）。
// メイン側では参照のみのため、terraform destroyしてもホストゾーンは削除されない（運用B）。
data "aws_route53_zone" "main" {
  name = var.domain_name
}


