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

// profileをハードコードせず、標準のクレデンシャルチェーンに任せる。
// ローカルでは`AWS_PROFILE=naw-fastapi-issue158`を環境変数で指定して使う想定。
// CI(GitHub Actions)はOIDCで発行された一時クレデンシャルを環境変数(AWS_ACCESS_KEY_ID等)で渡すため、
// ここでprofileを固定するとCI側に存在しないプロファイル名でエラーになる。
provider "aws" {
  region = var.region
}

