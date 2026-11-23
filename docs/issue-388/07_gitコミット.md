# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-388/` |
| 2 | ecr・ecs の出力を足す | `secuaigent-infra/modules/ecr/`・`ecs/` |
| 3 | デプロイ用ロールを絞り、インフラ用ロールを分ける | `secuaigent-infra/modules/github-actions/`・`secuaigent-infra/environments/dev/` |
| 4 | インフラのデプロイを、インフラ用ロールと Environment に切り替える | `.github/workflows/deploy-infra.yml` |
| 5 | README に 2 つのロールと Environment の手順を書く | `secuaigent-infra/README.md` |
| 6 | 動作確認と code-review の結果を記録 | `docs/issue-388/` |

注意: コミット 3 と 4 の間は、ワークフローが旧い Secret のままなので、途中のコミット単体では、インフラのデプロイが新しいロールを使わない。PR 全体で整えば足りる。

## 各コミットメッセージ案

```
#388 issue-388 設計ドキュメントを作成する
    - 00〜07 を作成

#388 issue-388 ecr・ecs の出力を足す
    - ロールのポリシーでリソースを限定するための ARN・名前を出す

#388 issue-388 デプロイ用ロールを絞り、インフラ用ロールを分ける
    - デプロイ用から PowerUserAccess・IAMFullAccess を外し、必要な操作だけにする
    - terraform apply 用のロールを、Environment infra に限った信頼条件で別に作る

#388 issue-388 インフラのデプロイを、インフラ用ロールと Environment に切り替える

#388 issue-388 README に 2 つのロールと Environment の手順を書く

#388 issue-388 動作確認と code-review の結果を記録する
```
