variable "backend_task_role_arn" {
  type        = string
  description = "backendタスクロールのARN(同上)"
}

variable "cloudfront_distribution_arn" {
  type        = string
  description = "CloudFrontディストリビューションのARN"
}

variable "ecs_task_execution_role_arn" {
  type        = string
  description = "ECSタスク実行ロールのARN(GitHub Actionsがタスク定義登録時にPassRoleする)"
}

variable "frontend_bucket_arn" {
  type        = string
  description = "フロントエンド配信用S3バケットのARN"
}

variable "project_name" {
  type        = string
  description = "リソース名・タグに使うプロジェクト名"
}

variable "tfstate_bucket_name" {
  type        = string
  description = "tfstateを置くS3バケット名(infra/bootstrapの出力state_bucket_name)。CIロールにstateへのアクセス権を付けるために使う"
}

variable "github_repository" {
  type        = string
  description = "OIDCの信頼条件に使うGitHubリポジトリ(<オーナー>/<リポジトリ>)"
}
