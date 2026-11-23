variable "region" {
  type    = string
  default = "ap-northeast-1"
}

// リソース名・Projectタグの元になる名前。CIではGitHubのVariable PROJECT_NAMEがTF_VAR_project_nameで渡される
// (deploy-backend.ymlも同じVariableから名前を組み立てるため、両者を食い違わせないこと)。
// デフォルトがあればそのまま使える｡デフォルトがなければ､terraform.tfvarsで指定する必要がある｡
variable "project_name" {
  type    = string
  default = "naw-fastapi"

  // CIの検査(deploy-infra.yml・deploy-backend.yml)と同じ形式。ハイフンで始まる・終わる名前は、ALBやS3の名前として不正
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$", var.project_name))
    error_message = "project_name は小文字・数字・ハイフンの3〜30文字で、ハイフンで始まらず終わらないこと。"
  }
}

variable "vpc_cidr" {
  type        = string
  default     = "10.10.0.0/16"
  description = "VPCのCIDR。public/privateサブネットはここから計算する(各/24)"

  // サブネットは cidrsubnet(var.vpc_cidr, 8, ...) で /24〜/26 を切り出す。プレフィックス長が /16〜/18 でないと、
  // サブネットが小さすぎたり計算に失敗したりする。ホストビットが立っている値(10.10.0.5/16など)も弾く。
  validation {
    condition = (
      can(cidrnetmask(var.vpc_cidr))
      && tonumber(split("/", var.vpc_cidr)[1]) >= 16
      && tonumber(split("/", var.vpc_cidr)[1]) <= 18
      && var.vpc_cidr == format("%s/%s", cidrhost(var.vpc_cidr, 0), split("/", var.vpc_cidr)[1])
    )
    error_message = "vpc_cidr は、ホストビットのない /16〜/18 のCIDR(例: 10.10.0.0/16)で指定すること。"
  }
}

variable "github_repository" {
  type        = string
  default     = "ryoya-masuda-unirita/naw-server-fastapi-nextjs"
  description = "OIDCの信頼条件に使うGitHubリポジトリ(<オーナー>/<リポジトリ>)。このリポジトリのdevelopブランチだけがCIロールを引き受けられる"
}

variable "allowed_ssh_cidrs" {
  type        = list(string)
  description = "踏み台へのSSH接続を許可するCIDRブロックのリスト"
}

variable "allowed_admin_cidrs" {
  type        = list(string)
  description = "管理サーバーへの接続を許可するCIDRブロックのリスト"
}

variable "key_pair_name" {
  type        = string
  description = "bastionへのSSH接続に使うキーペア名"
}

variable "tfstate_bucket_name" {
  type        = string
  description = "tfstateを置くS3バケット名(secuaigent-infra/bootstrapの出力state_bucket_name)。CIロールにstateへのアクセス権を付けるために使う"
}
