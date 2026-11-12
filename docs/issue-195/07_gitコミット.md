# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-195/00_チケット内容.md` |
| 2 | ドキュメント作成 | `docs/issue-195/01_要件定義.md`〜`07_gitコミット.md` |
| 3 | カスタムドメイン関連のTerraformリソースを削除しCloudFrontデフォルトドメインに切り替え | `infra/acm.tf`（削除）, `infra/cloudfront.tf`, `infra/main.tf`, `infra/variables.tf`, `infra/terraform.tfvars`, `infra/terraform.tfvars.example` |
| 4 | バックエンドCORS設定をCloudFrontデフォルトドメインの固定オリジンに変更 | `infra/ecs.tf` |
| 5 | 運用ドキュメントをカスタムドメイン廃止後の内容に更新 | `infra/README.md` |
| 6 | 動作確認結果の記録 | `docs/issue-195/08_動作確認.md` |

## 各コミットメッセージ案

```
#195 issue-195 00_チケット内容.md を作成
```

```
#195 issue-195 01_要件定義〜07_gitコミットを作成
    - カスタムドメイン廃止に伴う要件定義・基本設計・詳細設計・テスト設計をまとめた
```

```
#195 issue-195 カスタムドメイン関連のTerraformリソースを削除しCloudFrontデフォルトドメインに切り替え
    - acm.tfを削除（ACM証明書・DNS検証レコード）
    - cloudfront.tfのaliasesとRoute53 Aレコード（root/wildcard）を削除
    - viewer_certificateをCloudFrontのデフォルト証明書に変更
    - main.tfのRoute53ホストゾーン参照とus_east_1プロバイダを削除
    - variables.tf/terraform.tfvarsからdomain_nameを削除
```

```
#195 issue-195 バックエンドCORS設定をCloudFrontデフォルトドメインの固定オリジンに変更
    - CORS_ALLOWED_ORIGIN_REGEXを空文字化
    - CORS_ALLOWED_ORIGINSをCloudFrontディストリビューションのdomain_name参照に変更
```

```
#195 issue-195 カスタムドメイン廃止に合わせてREADME.mdを更新
    - デプロイ手順の動作確認URLをCloudFrontデフォルトドメインに変更
    - Route53別state運用の位置付け（メインから参照されなくなった旨）を追記
    - ignore_changesによりCORS設定が既存環境に自動反映されない点の手動対応手順を追記
```

```
#195 issue-195 08_動作確認.mdに確認結果を記録
```
