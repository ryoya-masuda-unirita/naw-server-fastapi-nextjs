# code-review 結果

`/code-review medium` を、ブランチ `feature/issue-386`（PR #414）に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的（指摘の重大度。条件つき） | `secuaigent-infra/modules/rds/main.tf` | すでに RDS がある環境に適用すると、RDS のパスワードが次のメンテナンスウィンドウまで反映されず、シークレットの値と食い違って、アプリが DB に接続できなくなる | 一部対応（README に明記。`apply_immediately` は付けない） |
| 2 | 🔵 提案 | `secuaigent-infra/modules/ecs/main.tf` | ECS サービスが、実行ロールの権限ポリシーの作成を待たない | 対応済み |
| 3 | 🔵 提案 | `secuaigent-infra/README.md` | 過去のタスク定義のリビジョンには、旧い平文の値が残る | 対応済み |
| 4 | 🔵 提案 | `secuaigent-infra/scripts/seed_via_bastion.sh` | シークレットの取得でリージョンを指定しておらず、手元の AWS 設定に依存する | 対応済み |

## 詳細

### 1. 既存の環境に適用したときの食い違い（条件つきで重大）→ 一部対応

指摘のとおり、すでに RDS がある環境に適用すると、Terraform は RDS のパスワードを新しい生成値に変えようとするが、`apply_immediately` が既定（false）のため、RDS には次のメンテナンスウィンドウまで反映されない。一方、Secrets Manager の `DATABASE_URL` は、すぐに新しい値になる。次にタスクが起動すると認証に失敗し、マイグレーションの一時タスクも失敗する。

ただし、この構成は、新アカウントへの新規構築が前提（#380）で、その場合は、RDS が最初からこのパスワードで作られるので、食い違いは起きない。`apply_immediately = true` は、付けない。バージョン変更の再起動など、RDS へのあらゆる変更が、メンテナンスを待たずに即時になり、影響がこの変更の範囲を超えるため。代わりに、README の「シークレット」の節に、**既存の環境に適用してはいけない**こと、その理由（上記の食い違い）、`apply_immediately` を付けない理由を、明記した。

### 2. 権限ポリシーの作成順序（🔵 提案）→ 対応済み

ポリシーは、サービスやタスク定義の属性から参照されないため、Terraform が並行して作り、最初のタスクが `AccessDenied` で起動に失敗する可能性があった。`aws_ecs_service.backend` に `depends_on = [aws_iam_role_policy.ecs_task_execution_secrets]` を足した。新規構築や、`destroy` 後の再構築でも、サービスは、権限の後に作られる。

### 3. 過去のリビジョンに残る平文（🔵 提案）→ 対応済み

「値が見えなくなる」のは、これから作られるリビジョンだけで、以前に登録されたリビジョンには、旧い平文が残る（Terraform も、この変更も消さない）。README に、そのこと、`ecs:DescribeTaskDefinition` が使える人は読めること、旧い値を使い回している場合は、漏れたものとして扱って変えること、を書いた。新アカウントの新規構築では、最初のリビジョンから `secrets` が使われ、平文は載らない。

### 4. 取得時のリージョン（🔵 提案）→ 対応済み

`aws secretsmanager get-secret-value` に `--region` を足した（既定は `ap-northeast-1`。環境変数 `AWS_REGION` で変えられる）。失敗時のメッセージにも、リージョンを含めた。空の `DB_PASSWORD` を、未指定として扱うことは、スクリプトの先頭の説明に明記した。偽の `aws` で、既定のリージョン、`AWS_REGION` の変更、空の `DB_PASSWORD`、失敗時のメッセージを確認した。
