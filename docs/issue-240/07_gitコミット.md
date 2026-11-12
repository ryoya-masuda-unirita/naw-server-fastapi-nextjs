# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-240/00`〜`07` |
| 2 | CloudFront の SPA フォールバックを S3 側に限定し、認証 API を `/backend/auth/*` に分離 | `infra/cloudfront.tf`、`infra/cloudfront_functions/*`、`.github/workflows/deploy-infra.yml`、`infra/README.md` |
| 3 | フロントの認証 API を `/backend` 付きで呼ぶ | `frontend/src/lib/api-client.ts`、`frontend/src/lib/api-client.test.ts`、`frontend/src/vite-env.d.ts`、`frontend/.env.production` |
| 4 | 動作確認・タスクリスト | `docs/issue-240/06`・`08` |
| 5 | code-review 結果 | `docs/issue-240/code-review.md`（＋指摘対応） |

## 各コミットメッセージ案

```
#240 issue-240 CloudFrontのエラー置き換えをやめる設計ドキュメントを作成
    - 00_チケット内容〜07_gitコミットを作成
```

```
#240 issue-240 CloudFrontのSPAフォールバックをS3側だけに効かせる
    - custom_error_response(403/404/405→index.html)を削除しAPIの応答をそのまま返す
    - S3ビヘイビアにviewer-requestのCloudFront Functionを付け、拡張子のないパスをindex.htmlに書き換える
    - /auth/*のALB転送を廃止し、/backend/auth/*をALBへ転送してプレフィックスを外す関数を追加
    - 関数の単体テスト(node --test)を追加し、deploy-infra.ymlで実行する
```

```
#240 issue-240 フロントの認証APIを/backendプレフィックス付きで呼べるようにする
    - buildUrlで/auth/始まりのパスはVITE_AUTH_API_URL(未指定ならVITE_API_URL)をベースにする
    - .env.productionにVITE_AUTH_API_URL=/backendを追加
```

```
#240 issue-240 動作確認結果を記録
    - 08_動作確認.mdに各コマンドの実行結果を記録
```
