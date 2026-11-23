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
  description = "tfstateを置くS3バケット名(secuaigent-infra/bootstrapの出力state_bucket_name)。CIロールにstateへのアクセス権を付けるために使う"
}

variable "github_repository" {
  type        = string
  description = "OIDCの信頼条件に使うGitHubリポジトリ(<オーナー>/<リポジトリ>)"
}

variable "ecr_repository_arn" {
  type        = string
  description = "backendのECRリポジトリのARN(デプロイ用ロールが、イメージのプッシュ先を限定する)"
}

variable "ecs_cluster_arn" {
  type        = string
  description = "ECSクラスタのARN(マイグレーションの一時タスクの起動先を限定する)"
}

variable "ecs_cluster_name" {
  type        = string
  description = "ECSクラスタの名前(クラスタ内のタスクのARNを組み立てる)"
}

variable "ecs_service_arn" {
  type        = string
  description = "backendサービスのARN(サービスの更新を限定する)"
}

variable "ecs_migrate_task_family" {
  type        = string
  description = "マイグレーション用タスク定義のファミリ名(一時タスクの起動を限定する)"
}
