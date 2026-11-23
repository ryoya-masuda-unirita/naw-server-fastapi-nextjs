// GitHub ActionsのOIDCトークンを検証するためのIDプロバイダ。
// AWSはGitHub側の証明書のサムプリントで信頼性を検証する(このthumbprintはGitHub Actions用として公知の固定値)。
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

locals {
  // ポリシーでリソースを限定するためのARN。ECSのタスク定義・タスクは、AWSの仕様上、ARNを組み立てて指定する
  ecs_arn_prefix              = "arn:aws:ecs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}"
  ecs_migrate_task_definition = "${local.ecs_arn_prefix}:task-definition/${var.ecs_migrate_task_family}:*"
  ecs_cluster_tasks           = "${local.ecs_arn_prefix}:task/${var.ecs_cluster_name}/*"
}

// ---------------------------------------------------------------------------------------------
// デプロイ用ロール(backend・frontendのデプロイ)。developへのpushで自動実行されるワークフローが使う。
// ふだんのデプロイが、アカウント全体を操作できる権限を持たないよう、必要な操作だけに絞る(#388)。
// 移植元のgithub-actions-devと同じ考え方(ECRプッシュ・ECS更新・S3同期・CloudFront無効化だけ)。
// ---------------------------------------------------------------------------------------------

// このリポジトリのdevelopブランチのワークフローだけが引き受けられるよう、subで厳密に限定する。
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/develop"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_actions" {
  name = "${var.project_name}-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        // GetAuthorizationTokenはリソースレベル権限をサポートしないAPIのため、AWS仕様上Resource="*"が必須
        Sid      = "EcrAuth"
        Effect   = "Allow"
        Action   = "ecr:GetAuthorizationToken"
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = var.ecr_repository_arn
      },
      {
        // タスク定義の取得・登録は、AWSの仕様上、リソースを限定できない(移植元も同じ)
        Sid    = "EcsTaskDefinition"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition"
        ]
        Resource = "*"
      },
      {
        // backendサービスの確認・更新(デプロイ)。サービスの安定待ちの確認(DescribeServices)も含む
        Sid    = "EcsService"
        Effect = "Allow"
        Action = [
          "ecs:DescribeServices",
          "ecs:UpdateService"
        ]
        Resource = var.ecs_service_arn
      },
      {
        // DBマイグレーションの一時タスク。マイグレーション用のタスク定義と、このクラスタに限って起動できる
        Sid      = "EcsRunMigration"
        Effect   = "Allow"
        Action   = "ecs:RunTask"
        Resource = local.ecs_migrate_task_definition
        Condition = {
          ArnEquals = {
            "ecs:cluster" = var.ecs_cluster_arn
          }
        }
      },
      {
        // 一時タスクの完了待ち・終了コードの確認
        Sid      = "EcsDescribeTasks"
        Effect   = "Allow"
        Action   = "ecs:DescribeTasks"
        Resource = local.ecs_cluster_tasks
      },
      {
        // タスク定義の新リビジョン登録・一時タスクの起動で、タスクが引き受けるロールを渡す。ECSのタスクに渡す場合に限る
        Sid    = "PassRoleForEcsTasks"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          var.ecs_task_execution_role_arn,
          var.backend_task_role_arn
        ]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "ecs-tasks.amazonaws.com"
          }
        }
      },
      {
        Sid      = "FrontendBucketList"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = var.frontend_bucket_arn
      },
      {
        Sid    = "FrontendObjects"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${var.frontend_bucket_arn}/*"
      },
      {
        Sid    = "CloudFrontInvalidation"
        Effect = "Allow"
        Action = [
          "cloudfront:CreateInvalidation",
          "cloudfront:GetInvalidation"
        ]
        Resource = var.cloudfront_distribution_arn
      }
    ]
  })
}

// ---------------------------------------------------------------------------------------------
// インフラ用ロール(terraform apply)。手動実行(run_infra)で、GitHubのEnvironment infra を使うジョブだけが使う。
//
// 権限は、現行と同じ広いまま(PowerUserAccess + IAMFullAccess)。**絞っていない**。
// terraform applyが必要とする権限(VPC/RDS/ECS/IAM/CloudFront等の各リソースのCRUD)は、実際にapplyを試さないと確定できず、
// 推測で絞ると、実際のapplyで予期しない失敗が起きるため。applyを実際に行う機会に、必要な権限を洗い出して絞ること(別の変更)。
// その代わり、広い権限を持つロールを、developへのpushで動くデプロイから切り離し(信頼条件を、Environmentに限る)、
// 手動実行のときだけ、Environment(承認者を設定すれば、人の承認が要る)経由で使えるようにした。
// ---------------------------------------------------------------------------------------------

resource "aws_iam_role" "github_actions_infra" {
  name = "${var.project_name}-github-actions-infra-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRoleWithWebIdentity"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Condition = {
        // Environmentを使うジョブのsubは「repo:<リポジトリ>:environment:<名前>」になる(ブランチは含まれない)。
        // ブランチの制限は、Environment側のdeployment branch policy(developのみ)で行う。
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:infra"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "github_actions_infra_power_user" {
  role       = aws_iam_role.github_actions_infra.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

// PowerUserAccessはIAM操作を意図的に除外しているため、IAMロール(ecs_task_execution/backend_task/
// このモジュールのロール自身等)も管理するsecuaigent-infra/には不足する。IAMFullAccessで補う(これも絞るべき対象)。
resource "aws_iam_role_policy_attachment" "github_actions_infra_iam_full_access" {
  role       = aws_iam_role.github_actions_infra.name
  policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
}

// tfstateへのアクセス。S3のネイティブロック(use_lockfile)は、ロックファイルの作成・削除を行うため、DeleteObjectも要る
resource "aws_iam_role_policy" "github_actions_infra" {
  name = "${var.project_name}-github-actions-infra-policy"
  role = aws_iam_role.github_actions_infra.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "TerraformStateAccess"
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        "arn:aws:s3:::${var.tfstate_bucket_name}",
        "arn:aws:s3:::${var.tfstate_bucket_name}/*"
      ]
    }]
  })
}
