terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  // tfstateをS3でリモート管理する。use_lockfileでS3ネイティブロックを使う(dynamodb_tableは
  // Terraform 1.11で非推奨化されたため使わない)。
  //
  // 移行手順(初回のみ、ユーザーが手動実施):
  //   1. このbackendブロックを追加する前に、まずaws_s3_bucket.tfstate(tfstate_backend.tf)を
  //      ローカルバックエンドのままapplyしてバケット自体を作る
  //   2. このbackendブロックを追加してから `terraform init -migrate-state` を実行し、
  //      ローカルのterraform.tfstateをS3へ移行する
  backend "s3" {
    bucket       = "naw-fastapi-issue160-tfstate"
    key          = "infra/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
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


