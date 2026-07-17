# 07_gitコミット

## コミット分割案

学習の記録・レビューのしやすさのため、リソース種別ごとに分割する。

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `docs/issue-160`のドキュメント一式を作成 | `docs/issue-160/00`〜`05` |
| 2 | Terraformの土台（provider・変数・gitignore）を作成 | `infra/main.tf`・`infra/variables.tf`・`infra/terraform.tfvars.example`・`.gitignore` |
| 3 | ネットワーク（VPC・サブネット・IGW・ルートテーブル）を追加 | `infra/network.tf` |
| 4 | セキュリティグループ5つを追加 | `infra/security_groups.tf` |
| 5 | ECR・RDS・ElastiCache・踏み台EC2を追加 | `infra/ecr.tf`・`infra/rds.tf`・`infra/elasticache.tf`・`infra/bastion.tf` |
| 6 | ECS（クラスタ・ASG・タスク定義・サービス・IAMロール）を追加 | `infra/ecs.tf` |
| 7 | ALB・ACM証明書・S3/CloudFrontを追加 | `infra/alb.tf`・`infra/acm.tf`・`infra/s3_cloudfront.tf`・`infra/outputs.tf` |
| 8 | 動作確認結果・タスクリストを記録 | `docs/issue-160/06`・`08` |

## 各コミットメッセージ案

```
#160 issue-160 docs/issue-160 のドキュメント一式を作成
    - Issue #158のAWS環境をTerraform化する要件・設計・テスト方針を記録
```

```
#160 issue-160 Terraformの土台（provider・変数）を作成
    - main.tf/variables.tfとgitignoreを追加し、terraform init/validateが通ることを確認
```

```
#160 issue-160 VPC・サブネット・IGW・ルートテーブルをTerraform化
```

```
#160 issue-160 セキュリティグループ5つをTerraform化
```

```
#160 issue-160 ECR・RDS・ElastiCache・踏み台EC2をTerraform化
```

```
#160 issue-160 ECSをTerraform化
```

```
#160 issue-160 ALB・ACM証明書・S3/CloudFrontをTerraform化
    - terraform apply/destroyでの動作確認結果を記録
```
