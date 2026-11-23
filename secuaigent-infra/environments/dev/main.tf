terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    // DBのパスワード・アプリの秘密鍵を、人が決めずに生成するために使う(#386)
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
  // tfstateをS3でリモート管理する。use_lockfileでS3ネイティブロックを使う(dynamodb_tableは
  // Terraform 1.11で非推奨化されたため使わない)。
  //
  // バケット名はここに書かない(アカウントごとに異なるため)。bootstrap/で作ったバケット名を
  // `terraform init -backend-config=backend.hcl`(CIは `-backend-config="bucket=..."`)で渡す。
  // backendブロックでは変数が使えないため、この部分設定の形にしている。
  backend "s3" {
    key          = "dev/terraform.tfstate"
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

  // Projectタグを全リソースに付ける。リソースごとに手書きすると付け忘れが起きるため。
  // ただしAuto Scalingグループが起動するEC2には伝播しないので、ASGのtagブロックは別に残している。
  default_tags {
    tags = {
      Project = var.project_name
    }
  }
}

// 各モジュールは入力と出力だけでつなぐ。依存の向きは
// network → rds / elasticache / alb / bastion、alb → frontend → ecs、
// ecs・frontend → github-actions で、循環しない。
// ALBをecsと別モジュールにしているのは、ECSのタスクがCloudFrontのドメイン(CORS)を使い、
// CloudFrontがALBをオリジンにするため。同じモジュールだとモジュール同士が循環する。

module "network" {
  source = "../../modules/network"

  project_name        = var.project_name
  vpc_cidr            = var.vpc_cidr
  allowed_ssh_cidrs   = var.allowed_ssh_cidrs
  allowed_admin_cidrs = var.allowed_admin_cidrs
}

module "rds" {
  source = "../../modules/rds"

  project_name       = var.project_name
  private_subnet_ids = module.network.private_subnet_ids
  rds_sg_id          = module.network.rds_sg_id
}

// backendの機密情報(DB接続文字列・秘密鍵)をSecrets Managerに保存する。ECSは、起動時にここから注入する
module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project_name
  db_address   = module.rds.address
  db_username  = module.rds.username
  db_name      = module.rds.db_name
  db_password  = module.rds.master_password
}

module "elasticache" {
  source = "../../modules/elasticache"

  project_name       = var.project_name
  private_subnet_ids = module.network.private_subnet_ids
  elasticache_sg_id  = module.network.elasticache_sg_id
}

module "ecr" {
  source = "../../modules/ecr"

  project_name = var.project_name
}

module "user_import" {
  source = "../../modules/user-import"

  project_name = var.project_name
}

module "alb" {
  source = "../../modules/alb"

  project_name      = var.project_name
  vpc_id            = module.network.vpc_id
  public_subnet_ids = module.network.public_subnet_ids
  alb_sg_id         = module.network.alb_sg_id
}

module "frontend" {
  source = "../../modules/frontend"

  project_name = var.project_name
  alb_dns_name = module.alb.dns_name
}

module "ecs" {
  source = "../../modules/ecs"

  // タスクはprivateサブネットに置かれ、イメージの取得・ログ送信にNATを使う。
  // NATのルートが整う前にサービスを作ると起動に失敗するため、ネットワーク全体を待つ。
  // (ecsモジュールにはデータソースが無いので、planの評価がapply後に遅れることはない)
  // 実際に必要なのはNATのルートだけだが、モジュールをまたぐ個別リソースへの依存は書けないため、モジュール全体で待つ。
  // applyが少し直列になるだけで害はない。networkがecsの出力に依存するようになると循環するので、その場合は見直すこと。
  depends_on = [module.network]

  project_name            = var.project_name
  region                  = var.region
  private_subnet_ids      = module.network.private_subnet_ids
  ecs_sg_id               = module.network.ecs_sg_id
  ecr_repository_url      = module.ecr.repository_url
  secret_arn              = module.secrets.secret_arn
  redis_endpoint          = module.elasticache.primary_endpoint_address
  cloudfront_domain_name  = module.frontend.domain_name
  user_import_bucket_name = module.user_import.bucket_name
  user_import_bucket_arn  = module.user_import.bucket_arn
  user_import_queue_url   = module.user_import.queue_url
  user_import_queue_arn   = module.user_import.queue_arn
  target_group_arn        = module.alb.target_group_arn
}

module "github_actions" {
  source = "../../modules/github-actions"

  project_name                = var.project_name
  ecs_task_execution_role_arn = module.ecs.execution_role_arn
  backend_task_role_arn       = module.ecs.task_role_arn
  frontend_bucket_arn         = module.frontend.bucket_arn
  cloudfront_distribution_arn = module.frontend.distribution_arn
  tfstate_bucket_name         = var.tfstate_bucket_name
  github_repository           = var.github_repository
}

module "bastion" {
  source = "../../modules/bastion"

  project_name     = var.project_name
  public_subnet_id = values(module.network.public_subnet_ids_by_key)[0]
  bastion_sg_id    = module.network.bastion_sg_id
  key_pair_name    = var.key_pair_name
}
