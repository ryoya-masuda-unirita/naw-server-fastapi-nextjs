# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-384/` |
| 2 | VPC の CIDR を変数にし、NAT GW と private のルートを足す | `infra/modules/network/`、`infra/environments/dev/variables.tf` |
| 3 | ALB のターゲットを IP 単位にする | `infra/modules/alb/main.tf` |
| 4 | ECS を Fargate（ARM64）に変え、EC2 用のリソースを削除する | `infra/modules/ecs/`、`infra/environments/dev/main.tf` |
| 5 | backend のデプロイを Fargate のマイグレーションに対応させる | `.github/workflows/deploy-backend.yml` |
| 6 | README と CLAUDE.md を Fargate + NAT の構成に直す | `infra/README.md`、`CLAUDE.md` |
| 7 | 動作確認と code-review の結果を記録 | `docs/issue-384/` |

注意: コミット 2〜4 の間は、ecs の入力が変わるため、途中のコミット単体では `validate` が通らない。分割は読みやすさのためで、PR 全体で通れば足りる。

## 各コミットメッセージ案

```
#384 issue-384 設計ドキュメントを作成する
    - 00〜07 を作成

#384 issue-384 VPC の CIDR を変数にし、NAT GW と private のルートを足す
    - cidrsubnet でサブネットを計算し、DNS を有効にする

#384 issue-384 ALB のターゲットを IP 単位にする

#384 issue-384 ECS を Fargate（ARM64）に変え、EC2 用のリソースを削除する
    - private サブネットに置き、NAT のルートに依存させる

#384 issue-384 backend のデプロイを Fargate のマイグレーションに対応させる
    - サービスのネットワーク設定を取得して run-task に渡し、キャパシティプロバイダを削除する

#384 issue-384 README と CLAUDE.md を Fargate + NAT の構成に直す
    - NAT のコストの注意を書く

#384 issue-384 動作確認と code-review の結果を記録する
```
