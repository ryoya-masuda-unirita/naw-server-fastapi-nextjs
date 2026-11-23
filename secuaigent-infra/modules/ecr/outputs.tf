// ECRリポジトリのURL
output "repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

// ECRリポジトリのARN。GitHub Actionsのデプロイ用ロールが、イメージのプッシュ先を限定するために使う
output "repository_arn" {
  value = aws_ecr_repository.backend.arn
}
