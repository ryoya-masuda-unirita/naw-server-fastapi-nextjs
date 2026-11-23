# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-382/` |
| 2 | network・rds・elasticache・ecr・alb・user-import のモジュールを作る | `infra/modules/{network,rds,elasticache,ecr,alb,user-import}/`、元の対応する `.tf`（削除） |
| 3 | ecs・frontend・github-actions・bastion のモジュールを作り、配信用の関数を移す | `infra/modules/{ecs,frontend,github-actions,bastion}/`、元の対応する `.tf` と `cloudfront_functions/`（削除・移動） |
| 4 | 環境（dev）を作る | `infra/environments/dev/`、元の `main.tf`・`variables.tf`・`outputs.tf`・`.terraform.lock.hcl`・`terraform.tfvars.example`・`backend.hcl.example`（移動） |
| 5 | CI・スクリプト・手順書を新しい構成に合わせる | `.github/workflows/deploy-infra.yml`、`infra/scripts/seed_via_bastion.sh`、`infra/README.md`、`infra/bootstrap/main.tf` |
| 6 | 動作確認と code-review の結果を記録 | `docs/issue-382/` |

注意: コミット 2 と 3 の間は、環境（dev）がまだ旧構成を指すので、途中のコミット単体では `validate` が通らない。分割は読みやすさのためで、PR 全体で通れば足りる。

## 各コミットメッセージ案

```
#382 issue-382 設計ドキュメントを作成する
    - 00〜07 を作成

#382 issue-382 network・rds・elasticache・ecr・alb・user-import をモジュールに分ける
    - リソースの設定値は変えず、別モジュールへの参照を変数に置き換える

#382 issue-382 ecs・frontend・github-actions・bastion をモジュールに分ける
    - 配信用の関数を frontend モジュールの下に移す

#382 issue-382 環境（dev）の構成を作り、各モジュールを組み合わせる
    - state の key を dev/terraform.tfstate にする
    - 変数と出力の名前は変えない

#382 issue-382 CI・踏み台スクリプト・手順書を新しい構成に合わせる
    - 作業ディレクトリ、関数のテストのパス、terraform output の取得先、backend.hcl の場所を直す

#382 issue-382 動作確認と code-review の結果を記録する
```
