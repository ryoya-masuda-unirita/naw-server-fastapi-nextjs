# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-386/` |
| 2 | DB のパスワードを自動生成にし、secrets モジュールを足す | `secuaigent-infra/modules/rds/`、`secuaigent-infra/modules/secrets/` |
| 3 | ECS の接続文字列・秘密鍵を Secrets Manager から注入する | `secuaigent-infra/modules/ecs/`、`secuaigent-infra/environments/dev/`（ロックファイルを含む） |
| 4 | CI と踏み台スクリプトを、自動生成の値に合わせる | `.github/workflows/deploy-infra.yml`、`secuaigent-infra/scripts/seed_via_bastion.sh` |
| 5 | README にシークレットの扱いを書く | `secuaigent-infra/README.md` |
| 6 | 動作確認と code-review の結果を記録 | `docs/issue-386/` |

注意: コミット 2 と 3 の間は、ecs の入力が変わるため、途中のコミット単体では `validate` が通らない。PR 全体で通れば足りる。

## 各コミットメッセージ案

```
#386 issue-386 設計ドキュメントを作成する
    - 00〜07 を作成

#386 issue-386 DB のパスワードを自動生成にし、secrets モジュールを足す
    - random_password でパスワードと秘密鍵を生成し、接続文字列とともに Secrets Manager に保存する

#386 issue-386 ECS の接続文字列・秘密鍵を Secrets Manager から注入する
    - タスク定義の平文の環境変数を削除し、実行ロールにシークレットの読み取りを許可する
    - 変数 db_password・secret_key を削除する

#386 issue-386 CI と踏み台スクリプトを、自動生成の値に合わせる
    - TF_VAR_db_password・TF_VAR_secret_key を削除し、シード投入は Secrets Manager からパスワードを取得する

#386 issue-386 README にシークレットの扱いを書く

#386 issue-386 動作確認と code-review の結果を記録する
```
