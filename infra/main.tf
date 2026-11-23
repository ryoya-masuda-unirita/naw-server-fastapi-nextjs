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
  // バケット名はここに書かない(アカウントごとに異なるため)。bootstrap/で作ったバケット名を
  // `terraform init -backend-config=backend.hcl`(CIは `-backend-config="bucket=..."`)で渡す。
  // backendブロックでは変数が使えないため、この部分設定の形にしている。
  backend "s3" {
    key          = "infra/terraform.tfstate"
    region       = "ap-northeast-1"
    use_lockfile = true
  }
}

// profileをハードコードせず、標準のクレデンシャルチェーンに任せる。
// ローカルでは`AWS_PROFILE=oic`を環境変数で指定して使う想定。
// CI(GitHub Actions)はOIDCで発行された一時クレデンシャルを環境変数(AWS_ACCESS_KEY_ID等)で渡すため、
// ここでprofileを固定するとCI側に存在しないプロファイル名でエラーになる。
provider "aws" {
  region = var.region
}

