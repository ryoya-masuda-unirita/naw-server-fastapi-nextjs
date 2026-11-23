# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-381/` |
| 2 | state 用の bootstrap 構成を新設 | `infra/bootstrap/`、`infra/backend.hcl.example`、`.gitignore` |
| 3 | 本体の backend を部分設定にし、state バケットの定義を削除 | `infra/main.tf`、`infra/tfstate_backend.tf`（削除） |
| 4 | push でインフラを自動適用しないようにし、init にバケット名を渡す | `.github/workflows/deploy.yml`、`.github/workflows/deploy-infra.yml` |
| 5 | README を新しい構築手順に直す | `infra/README.md` |
| 6 | 動作確認の記録 | `docs/issue-381/08_動作確認.md`、`06_タスクリスト.md` |

## 各コミットメッセージ案

```
#381 issue-381 設計ドキュメントを作成する
    - 00〜07 を作成

#381 issue-381 tfstate 用の S3 を infra/bootstrap に分離する
    - バージョニング・AES256・public block・prevent_destroy を付け、バケット名にアカウント ID を含める
    - backend 設定の雛形 backend.hcl.example を追加し、実体を .gitignore に足す

#381 issue-381 infra 本体の backend を部分設定にし、state バケットの定義を削除する
    - バケット名を -backend-config で渡す形にする
    - tfstate_backend.tf を削除し、プロファイル名のコメントを oic に直す

#381 issue-381 develop への push でインフラが自動適用されないようにする
    - deploy.yml の infra ジョブを、手動実行で run_infra を指定したときだけ実行する
    - 不要になった changes ジョブの infra 出力とフィルタを削除する
    - deploy-infra.yml の terraform init に state バケット名を渡し、未登録なら失敗させる

#381 issue-381 infra の README を新アカウント向けの構築手順に直す
    - bootstrap → backend 設定 → Secrets/Variables 登録 → apply の順に書く

#381 issue-381 動作確認の結果を記録する
```
