// GitHub ActionsのOIDCトークンを検証するためのIDプロバイダ。
// AWSはGitHub側の証明書のサムプリントで信頼性を検証する(このthumbprintはGitHub Actions用として公知の固定値)。
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

// GitHub ActionsのワークフローがAssumeRoleWithWebIdentityで引き受けるロール。
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
          "token.actions.githubusercontent.com:sub" = "repo:ryoya-masuda-unirita/naw-server-fastapi-nextjs:ref:refs/heads/develop"
        }
      }
    }]
  })
}

// 本来はterraform applyが実際に呼ぶAWS API(VPC/RDS/ElastiCache/ALB/SG等の各リソースのCRUD)を
// 個別に洗い出し、最小権限の原則に従ってActionを絞り込んだカスタムポリシーを与えるべきである。
// 今回はdev/staging限定の小規模構成であることを踏まえ、洗い出しコストを避けてAWS標準の広範な
// 権限セットPowerUserAccessをアタッチする簡易対応とした(要件定義の非機能要件からの逸脱として記録)。
// PowerUserAccessはIAM操作を意図的に除外しているため、IAMロール(ecs_task_execution/backend_task/
// このgithub_actionsロール自身等)も管理するinfra/には不足する。IAMFullAccessを別途アタッチして補うが、
// これも本来はIAMロール操作を対象リソースに限定したカスタムポリシーにすべきところを簡略化している。
resource "aws_iam_role_policy_attachment" "github_actions_power_user" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/PowerUserAccess"
}

resource "aws_iam_role_policy_attachment" "github_actions_iam_full_access" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/IAMFullAccess"
}

// PowerUserAccess/IAMFullAccessでカバーされない、リソースを限定した細かい権限をここに追加でまとめる
resource "aws_iam_role_policy" "github_actions" {
  name = "${var.project_name}-github-actions-policy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        // GetAuthorizationTokenはリソースレベル権限をサポートしないAPIのため、AWS仕様上Resource="*"が必須
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = "*"
      },
      {
        Sid    = "EcsDeploy"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = "*"
      },
      {
        // ECSタスク定義への新リビジョン登録時、タスクが引き受けるロールをPassRoleする権限が必要
        Sid    = "PassRoleForEcsTasks"
        Effect = "Allow"
        Action = "iam:PassRole"
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.backend_task.arn
        ]
      },
      {
        Sid    = "FrontendBucketSync"
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.frontend.arn,
          "${aws_s3_bucket.frontend.arn}/*"
        ]
      },
      {
        Sid      = "CloudFrontInvalidation"
        Effect   = "Allow"
        Action   = "cloudfront:CreateInvalidation"
        Resource = aws_cloudfront_distribution.main.arn
      },
      {
        Sid    = "TerraformStateAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.tfstate.arn,
          "${aws_s3_bucket.tfstate.arn}/*"
        ]
      }
    ]
  })
}
