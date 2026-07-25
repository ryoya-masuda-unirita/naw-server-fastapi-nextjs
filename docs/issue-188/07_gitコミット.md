# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs/issue-188 一式を作成 | `docs/issue-188/*` |
| 2 | SQSキュー(メイン+DLQ)・S3バケット・ECSタスクロールをTerraformで追加し、backendタスク定義に紐付け | `infra/sqs.tf`, `infra/s3_user_import.tf`, `infra/iam.tf`, `infra/ecs.tf`, `infra/outputs.tf` |
| 3 | 動作確認結果(terraform plan)を記録 | `docs/issue-188/08_動作確認.md` |

## 各コミットメッセージ案

```
#188 issue-188 00〜05のドキュメントを作成
    - チケット内容・要件定義・基本設計・詳細設計・テスト設計を作成
```

```
#188 issue-188 SQS/S3/IAMをTerraformで定義しbackendタスクに紐付け
    - ユーザーインポート用SQSメインキュー・DLQを追加
    - ユーザーインポート用S3バケット(非公開)を追加
    - SQS/S3アクセス用のECSタスクロールを新規作成しbackendタスク定義に付与
    - backendタスク定義にAWS_S3_BUCKET_NAME/AWS_SQS_QUEUE_URL環境変数を追加
    - outputsにキューURL・バケット名を追加
```

```
#188 issue-188 08_動作確認.mdにterraform planの結果を記載
    - terraform fmt/validate/planの実行結果を記録
```
