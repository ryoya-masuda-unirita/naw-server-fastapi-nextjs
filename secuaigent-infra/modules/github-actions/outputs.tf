// デプロイ用ロールのARN。backend・frontendのデプロイ(developへのpushで動く)がAssumeRoleする(GitHubのSecret AWS_ROLE_ARN)
output "role_arn" {
  value = aws_iam_role.github_actions.arn
}

// インフラ用ロールのARN。terraform apply(手動実行)だけが、Environment infra を使うジョブからAssumeRoleする(GitHubのSecret AWS_INFRA_ROLE_ARN)
output "infra_role_arn" {
  value = aws_iam_role.github_actions_infra.arn
}
