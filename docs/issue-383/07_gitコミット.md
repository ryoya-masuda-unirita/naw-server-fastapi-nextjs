# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-383/` |
| 2 | provider に既定タグを入れ、手書きの Project タグを削除する | `infra/environments/dev/main.tf`、`infra/modules/*/main.tf` |
| 3 | プロジェクト名・リポジトリ名・プレフィックスリストの直書きをやめる | `infra/environments/dev/variables.tf`・`main.tf`、`infra/modules/github-actions/`、`infra/modules/network/main.tf` |
| 4 | CI の名前を GitHub の Variable PROJECT_NAME から組み立てる | `.github/workflows/deploy-infra.yml`、`deploy-backend.yml` |
| 5 | infra/route53 を削除する | `infra/route53/`、`.github/workflows/deploy.yml` |
| 6 | README を直す | `infra/README.md` |
| 7 | 動作確認と code-review の結果を記録 | `docs/issue-383/` |

## 各コミットメッセージ案

```
#383 issue-383 設計ドキュメントを作成する
    - 00〜07 を作成

#383 issue-383 Project タグを provider の default_tags にまとめる
    - 各モジュールの手書きの Project タグを削除する（ASG の伝播タグは残す）

#383 issue-383 プロジェクト名・リポジトリ名・プレフィックスリストの直書きをやめる
    - project_name の既定値から Issue 番号を取る
    - OIDC の信頼条件のリポジトリ名を変数にする
    - CloudFront 向けのプレフィックスリストを名前から引く

#383 issue-383 CI のリソース名を GitHub の Variable PROJECT_NAME から組み立てる
    - deploy-infra.yml は TF_VAR_project_name で渡し、空・不正なら失敗させる
    - deploy-backend.yml はクラスタ名などを PROJECT_NAME から組み立てる

#383 issue-383 infra/route53 を削除する
    - deploy.yml の変更検出の除外条件も削除する

#383 issue-383 infra の README から route53 の記述を削除し、PROJECT_NAME の登録手順を足す

#383 issue-383 動作確認と code-review の結果を記録する
```
