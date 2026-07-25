# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs/issue-189 一式を作成 | `docs/issue-189/*` |
| 2 | OIDC・tfstateリモートバックエンドをTerraformで追加 | `infra/github_oidc.tf`, `infra/tfstate_backend.tf`, `infra/main.tf` |
| 3 | frontend-angular/backend/infraのデプロイworkflowを追加 | `.github/workflows/deploy-frontend-angular.yml`, `.github/workflows/deploy-backend.yml`, `.github/workflows/deploy-infra.yml` |
| 4 | 動作確認結果を記録 | `docs/issue-189/08_動作確認.md` |

## 各コミットメッセージ案

```
#189 issue-189 00〜05のドキュメントを作成
    - チケット内容・要件定義・基本設計・詳細設計・テスト設計を作成
```

```
#189 issue-189 OIDC認証用IAMロールとtfstateリモートバックエンドを追加
    - GitHub Actions用OIDCプロバイダ・IAMロール・ポリシーを追加(develop限定)
    - tfstate用S3バケット・DynamoDBロックテーブルを追加
    - main.tfにリモートバックエンド設定を追加
```

```
#189 issue-189 frontend-angular/backend/infraのデプロイworkflowを追加
    - deploy-frontend-angular.yml: ビルド→S3 sync→CloudFrontキャッシュ無効化
    - deploy-backend.yml: テスト→ARM64 Dockerビルド→ECR push→ECS force-new-deployment
    - deploy-infra.yml: terraform plan→apply(route53サブディレクトリは対象外)
```

```
#189 issue-189 08_動作確認.mdに確認結果を記載
    - terraform fmt/validate/planとワークフローYAML構文の確認結果を記録
```
