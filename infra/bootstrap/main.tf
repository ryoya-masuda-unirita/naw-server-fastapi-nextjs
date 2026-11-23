// Terraform state(tfstate)を置くS3バケットを、インフラ本体(infra/)とは別のstateで作る。
//
// 本体がバケットを管理すると、terraform destroyでstateの置き場所ごと消え、バケットが無い状態から
// 作り直す手順が必要になる(過去に発生)。それを避けるため、このディレクトリで一度だけ作り、
// 本体のdestroyの対象に入れない。
//
// 使い方(初回のみ。ローカルstateのまま実行する):
//   AWS_PROFILE=oic terraform init
//   AWS_PROFILE=oic terraform apply
//   terraform output -raw backend_config > ../environments/dev/backend.hcl
//
// このディレクトリのterraform.tfstate(ローカル)は消さないこと。消えた場合はterraform importで復元する。

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

// profileは固定しない。ローカルでは環境変数 AWS_PROFILE=oic で指定する。
provider "aws" {
  region = var.region
}

variable "region" {
  type    = string
  default = "ap-northeast-1"
}

variable "project_name" {
  type    = string
  default = "naw-fastapi"
}

data "aws_caller_identity" "current" {}

locals {
  // S3のバケット名は全世界で一意なので、アカウントIDを含めて他アカウントとの衝突を避ける
  bucket_name = "${var.project_name}-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "tfstate" {
  bucket = local.bucket_name

  // stateを誤って消さないようにする。force_destroyは付けない(中身が残っていれば削除できない)。
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name    = local.bucket_name
    Project = var.project_name
  }
}

// 誤ってstateを上書き・削除してしまった場合に復元できるよう、バージョニングを有効化する
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

// tfstateにはDBパスワード等の機密情報が平文で含まれるため、保存時に暗号化する
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

// tfstateには機密情報が含まれるため、パブリックアクセスを全面的にブロックする
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  // 新規に付与されるパブリックACLを拒否する
  block_public_acls = true
  // パブリックアクセスを許可するバケットポリシーの設定自体を拒否する
  block_public_policy = true
  // 既存のパブリックACLが付いていても、それを無視して非公開として扱う
  ignore_public_acls = true
  // 上記でパブリックとみなされるACL/ポリシーが設定されていても、実際のパブリックアクセスを遮断する
  restrict_public_buckets = true
}

output "state_bucket_name" {
  value = aws_s3_bucket.tfstate.id
}

// infra/backend.hcl にそのまま保存できる形。CIにはこのバケット名をGitHubのVariable TF_STATE_BUCKETに登録する
output "backend_config" {
  value = "bucket = \"${aws_s3_bucket.tfstate.id}\"\n"
}
