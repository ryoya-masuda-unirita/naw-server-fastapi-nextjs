# secuaigent-infra/ 運用メモ

AWS インフラ（dev / staging 用。本番なし）を Terraform で管理するディレクトリです。このファイルには、構築・デプロイの手順と、設計判断をまとめています。

- **初めて触る人**: 「ディレクトリ構成」→「初回セットアップ」→「デプロイ手順」の順に読む
- **運用する人**: 「やりたいこと別の早見表」から探す
- **設計判断を知りたい人**: 「GitHub Actions の AWS ロール」以降を読む

以降の `terraform` コマンドは、特記がなければ `secuaigent-infra/environments/dev` で実行します。

## やりたいこと別の早見表

| やりたいこと | 見る場所 |
|---|---|
| 新しい AWS アカウントに環境を作る | 「初回セットアップ手順」 |
| GitHub Actions からデプロイできるようにする | 「GitHub Actions からのデプロイ（CI/CD）の初回セットアップ」 |
| インフラ（Terraform）を反映する | `gh workflow run deploy.yml -f run_infra=true` |
| backend・frontend を手で配信する | 「デプロイ手順」の 1・2 |
| シードデータを入れる | 「デプロイ手順」の 3 |
| DB のパスワードなどを確認する | 「シークレット（Secrets Manager）」 |
| RDS を止めたい | 「データストアの設定」の「RDS の停止運用」 |
| 費用を抑えたい・環境を消したい | 「コスト」「destroy 時の注意」 |

## ディレクトリ構成

```
secuaigent-infra/
├── bootstrap/        # tfstate 用 S3 バケットだけ。メインとは別 state（初回に一度だけ作る）
├── environments/dev/ # メイン構成。各モジュールを組み合わせる（terraform はここで実行する）
├── modules/          # network・rds・elasticache・ecr・alb・ecs・frontend・secrets・github-actions・bastion・user-import
└── scripts/          # 踏み台経由の seed 投入スクリプトなど
```

- `modules/` は再利用できる単位で、`environments/dev/` が入力と出力でつなぐ（移植元 `secuaigent-infra` と同じ分け方）
- ALB だけは、移植元の ecs モジュールから独立させている。ECS のタスクが CloudFront のドメイン（CORS）を使い、CloudFront が ALB をオリジンにするため、同じモジュールにするとモジュール同士が循環する

## 初回セットアップ手順

新しい AWS アカウントへの構築時と、`terraform destroy` 後の再構築時の手順です。ローカルでは、環境変数 `AWS_PROFILE=oic` を付けて実行します（`.tf` には profile を固定しない。CI は OIDC の一時クレデンシャルを使うため）。

> **注意（既存の環境には適用しない）**
> - この手順と構成は、**新しい AWS アカウントへの新規構築が前提**。
> - `project_name` の既定値を `naw-fastapi-issue160` から `naw-fastapi` に変えた（#383）。旧名の環境に適用すると、ほぼ全リソース（RDS・ECR・ECS・S3 など）が作り直しになる。S3 のバケット名には、全世界で一意にするため AWS アカウント ID を含める。
> - 構成を `modules/` + `environments/dev` に分けたとき（#382）に、state の key を `secuaigent-infra/terraform.tfstate` から `dev/terraform.tfstate` に変えた。旧構成の環境にそのまま適用すると、空の新 key に作成を試みて、名前の衝突で失敗する。引き継ぐ場合は、先に state オブジェクトを新 key へコピーすること（`moved` ブロックは使っていない）。

tfstate 用の S3 バケットは、メイン構成とは別の state（`secuaigent-infra/bootstrap/`）で管理します。メインがバケットを管理すると、`terraform destroy` で「state の置き場所」ごと消えるためです。メインを `destroy` しても state は残ります（`prevent_destroy` 付き）。

### 1. state 用バケットを作る（初回のみ）

```bash
cd secuaigent-infra/bootstrap
AWS_PROFILE=oic terraform init
AWS_PROFILE=oic terraform apply
AWS_PROFILE=oic terraform output -raw backend_config > ../environments/dev/backend.hcl
```

- バケット名は `<project_name>-tfstate-<AWSアカウントID>` になる
- `environments/dev/backend.hcl` は `.gitignore` 済み。git 管理しない（雛形は `backend.hcl.example`）
- `bootstrap/` の `terraform.tfstate`（ローカル）は消さないこと

**`terraform.tfstate` を失った場合**（別の PC で実行する場合も同じ）: `apply` の前に、次の `import` で復元します。バケットが既にあるのに `apply` すると、`BucketAlreadyOwnedByYou` で失敗します。

```bash
cd secuaigent-infra/bootstrap
B=<project_name>-tfstate-<AWSアカウントID>
AWS_PROFILE=oic terraform import aws_s3_bucket.tfstate "$B"
AWS_PROFILE=oic terraform import aws_s3_bucket_versioning.tfstate "$B"
AWS_PROFILE=oic terraform import aws_s3_bucket_server_side_encryption_configuration.tfstate "$B"
AWS_PROFILE=oic terraform import aws_s3_bucket_public_access_block.tfstate "$B"
```

### 2. メイン構成を初期化する

```bash
cd secuaigent-infra/environments/dev
AWS_PROFILE=oic terraform init -backend-config=backend.hcl
```

### 3. `terraform.tfvars` を用意する

`terraform.tfvars.example` を参考に作ります。`tfstate_bucket_name` には、手順 1 のバケット名を入れます。`project_name` を既定値（`naw-fastapi`）から変える場合は、CI の Variable `PROJECT_NAME` も同じ値にします。

### 4. `apply` する

```bash
AWS_PROFILE=oic terraform apply
```

以降は、通常どおり `terraform plan` / `apply` / `destroy` を使えます（S3 のネイティブロックにより、複数人の同時 `apply` も安全）。

> 独自ドメイン（Route53・ACM・ワイルドカード）は #195 で廃止した。別 state の `secuaigent-infra/route53/` は #383 で削除した。CloudFront は、デフォルトドメイン（`*.cloudfront.net`）で配信する。

## GitHub Actions からのデプロイ（CI/CD）の初回セットアップ

`.github/workflows/deploy.yml` は、`develop` への push では **server と frontend だけ**を自動デプロイします。**インフラ（`terraform apply`）は自動では実行されません**（構成の作り直し中に、意図せず適用されるのを防ぐため。#381）。`secuaigent-infra/` の変更を含む push でも同じで、`deploy.yml` が警告を出します。

インフラを反映するときは、server・frontend より先に、次のコマンドで手動実行します（Actions タブの `Deploy` で `run_infra` を true にしても同じ）。

```bash
gh workflow run deploy.yml -f run_infra=true
```

### 手順

1. **前提**: 「初回セットアップ手順」で `terraform apply` 済みであること
2. **GitHub の Secrets / Variables を登録する**（下記）
3. **動作確認**: `develop` に適当な変更を push し、Actions タブで `Deploy` が起動して、変更のあった `backend` / `frontend` のジョブが成功することを確認する（`infra` ジョブはスキップされる）。インフラは、上の `gh workflow run` で手動起動して確認する

### Secrets / Variables の登録

`AWS_ROLE_ARN`・`AWS_INFRA_ROLE_ARN`・`FRONTEND_BUCKET_NAME`・`CLOUDFRONT_DISTRIBUTION_ID` は、`terraform output` から取れます。それ以外は、`terraform.tfvars` と同じ値を使います。DB のパスワードとアプリの秘密鍵は、Terraform が自動生成して Secrets Manager に保存するため、登録不要です（#386）。

`gh` CLI（[GitHub CLI](https://cli.github.com/)、ログイン済み）で、次のように一括登録できます。

```bash
cd secuaigent-infra/environments/dev

# terraform output から取得できるもの
# デプロイ用ロール(backend・frontend のデプロイ。develop への push で動く)
gh secret set AWS_ROLE_ARN --body "$(terraform output -raw github_actions_role_arn)"
# インフラ用ロール(terraform apply 用)は、既定では作られない。使うときだけ、「GitHub Actions の AWS ロール」の手順
# (Environment infra の保護 → enable_github_actions_infra_role=true でローカル apply)のあとに登録する。
# 未登録だと、インフラのデプロイ(手動実行)は失敗する
# gh secret set AWS_INFRA_ROLE_ARN --body "$(terraform output -raw github_actions_infra_role_arn)"
gh variable set FRONTEND_BUCKET_NAME --body "$(terraform output -raw frontend_bucket_name)"
gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "$(terraform output -raw cloudfront_distribution_id)"

# terraform.tfvars と同じ値を使うもの（<...> は実際の値に置き換える）
# ALLOWED_SSH_CIDRS / ALLOWED_ADMIN_CIDRS は list(string) 型の variable のため、TF_VAR_ 経由で渡す値は
# カンマ区切りではなく HCL/JSON の配列表記にすること（例: ["1.2.3.4/32","5.6.7.8/32"]）。
# カンマ区切りを渡すと "Invalid number literal" 等のパースエラーで terraform plan が失敗する。
gh secret set ALLOWED_SSH_CIDRS --body "<terraform.tfvars の allowed_ssh_cidrs をそのままコピー、例: [\"1.2.3.4/32\"]>"
gh secret set ALLOWED_ADMIN_CIDRS --body "<terraform.tfvars の allowed_admin_cidrs をそのままコピー、例: [\"1.2.3.4/32\"]>"
gh variable set KEY_PAIR_NAME --body "<terraform.tfvars の key_pair_name>"
# プロジェクト名（リソース名の元。deploy-infra.yml は TF_VAR_project_name で渡し、deploy-backend.yml はクラスタ名などを組み立てる）。
# terraform.tfvars で project_name を変えた場合は同じ値にすること（既定値は naw-fastapi）。未登録だとデプロイは失敗する
gh variable set PROJECT_NAME --body "naw-fastapi"
# bootstrap で作った state 用バケット名（deploy-infra.yml の terraform init と plan/apply で使う。未登録だとインフラのジョブは失敗する）
gh variable set TF_STATE_BUCKET --body "$(terraform -chdir=../../bootstrap output -raw state_bucket_name)"

# GitHub Projects 連携用(project-status-sync.yml が使用。デプロイとは別用途。未登録なら要発行)
gh secret set PROJECT_PAT --body "<repo・project 権限を持つ Personal Access Token>"
```

- 登録済みかどうかは、`gh secret list` / `gh variable list` で確認できる
- `DOMAIN_NAME` 変数は、カスタムドメインの廃止（#195）で不要になった。登録不要

## デプロイ手順（apply 後に必要な作業）

`terraform apply` は、インフラの「箱」を作るだけで、中身（アプリ）は空です。次の作業が別途要ります。

### 1. backend イメージを ECR へ push

ECS のタスクは Fargate 上で ARM64（`runtime_platform` で明示）として動かしているため、**`--platform linux/arm64` が必須**です（付け忘れると、ECS で `exec format error` になる）。

```bash
aws ecr get-login-password --region ap-northeast-1 --profile oic \
  | docker login --username AWS --password-stdin <ECRリポジトリURL の アカウントID部分>

cd server
docker build --platform linux/arm64 -t <ecr_repository_url>:latest .
docker push <ecr_repository_url>:latest
```

- 初回は、push 後に、ECS がタスク起動失敗のリトライで自動的に `:latest` を pull して起動する（数分）
- **2 回目以降**は自動では入れ替わらないので、次のコマンドで再デプロイする

```bash
aws ecs update-service --cluster <cluster名> --service <service名> --force-new-deployment
```

**環境変数（`CORS_ALLOWED_ORIGINS` など）を変えたとき**: `aws_ecs_task_definition.backend` には `lifecycle { ignore_changes = [container_definitions] }` が付いています。CI は、登録済みのタスク定義を複製して、イメージタグだけ差し替える運用のためです。そのため、環境変数の変更は、`terraform apply` だけでは既存の環境に反映されません。次のどちらかが必要です。

- 環境ごと作り直す（`terraform destroy` → `terraform apply`）
- 壊さずに反映する場合は、CI と同じように、手動でタスク定義を再登録する

```bash
aws ecs describe-task-definition --task-definition <family名> --query 'taskDefinition' > task-definition.json
# Terraform で生成した最新の container_definitions を反映させた JSON を用意した上で
aws ecs register-task-definition --cli-input-json file://task-def-clean.json
aws ecs update-service --cluster <cluster名> --service <service名> \
  --task-definition <上記で払い出された ARN> --force-new-deployment
```

### 2. frontend（React）をビルドして S3 へ

通常は、`develop` への push 時に `deploy-frontend.yml` が自動で実行します。手動で配信する場合は、次のとおりです。

```bash
cd client
npm ci
npm run build   # 出力先: dist/

aws s3 sync dist/ s3://<frontend_bucket名>/ --delete --profile oic
aws cloudfront create-invalidation --distribution-id <cloudfront配信ID> --paths "/*" --profile oic
```

配信の仕組み（参考）:

- `client/.env.production` で `VITE_API_URL` を空にしている。API は、配信元（CloudFront）と同じオリジンの相対パスで呼ばれ、CloudFront が backend（ALB）へ転送する
- 認証 API（`/auth/*`）は、React の画面（`/auth/login` など）と同じパスのため、`VITE_AUTH_API_URL=/backend` を付けて `/backend/auth/*` で呼ぶ。CloudFront Function が `/backend` を外して backend へ渡す（#240）
- それ以外のパスは S3 から配信する。画面パス（拡張子なし）は、CloudFront Function が `index.html` に書き換える（API の 403 / 404 などは `index.html` に置き換えない）

### 3. bastion 経由でシード投入

- DB マイグレーション（`alembic upgrade head`）は、`deploy-backend.yml` が自動で実行する。backend のデプロイのたびに、サービス更新の前に適用される（#197）
- シードデータ（`seed.sql`）の投入は、再実行すると重複やエラーの恐れがある（非冪等）ため、CI/CD には含めない。**環境構築時（destroy 後の再構築時も含む）に、スクリプトで手動実行する**

```bash
PEM_KEY_PATH=~/.ssh/<キーペア名>.pem \
  bash secuaigent-infra/scripts/seed_via_bastion.sh
```

スクリプトがやること:

- `terraform output` から `rds_endpoint`・`bastion_public_ip` を自動取得する
- SSH トンネルの確立 → マイグレーション適用 → `seed.sql` 投入 → トンネルの後始末まで、1 コマンドで行う
- DB のパスワードは、環境変数 `DB_PASSWORD` を渡さなければ、Secrets Manager（`terraform output backend_secret_name` のシークレット）から自動で取得する。AWS CLI と jq が必要で、権限のある `AWS_PROFILE` で実行すること
- SSH トンネルのローカルポートは、既定で `15433`（開発用 DB の `5433` と重ならない）。変えるときは、環境変数 `LOCAL_PORT` を指定する

CI/CD で既にマイグレーション済みなら、`--skip-migrate` を付けて、seed 投入だけにできます。

```bash
PEM_KEY_PATH=~/.ssh/<キーペア名>.pem \
  bash secuaigent-infra/scripts/seed_via_bastion.sh --skip-migrate
```

**実際の AI エンドポイントの接続情報を使いたい場合**:

1. `secuaigent-infra/scripts/.env.example` を `secuaigent-infra/scripts/.env` としてコピーする（`.gitignore` 対象。コミットしないこと）
2. `AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_ENDPOINT` に、実際の値を設定して実行する
3. seed 投入後、`AZURE_OPENAI_CHAT` / `AZURE_OPENAI_EMBEDDING` エンドポイントの `api_key`・`endpoint` が、実際の値で上書きされる（`seed.sql` 自体はダミー値のまま変えない）

### 4. 動作確認

`terraform output cloudfront_domain_name` で確認した CloudFront のデフォルトドメイン（`https://<distribution-id>.cloudfront.net/`）にアクセスします。テナント ID は、URL（サブドメイン）からではなく、ログイン画面で入力します（#193）。

## GitHub Actions の AWS ロール（#388）

GitHub Actions が AWS を操作するロールは、**用途で 2 つに分けています**。以前は、1 つのロールが `PowerUserAccess` + `IAMFullAccess`（アカウントのほぼ全権）を持ち、`develop` への push で自動実行されるデプロイも、それを使っていました。

| ロール | 使う場面 | 権限 |
|---|---|---|
| **デプロイ用**（`<プロジェクト名>-github-actions-role`） | backend・frontend のデプロイ（`develop` への push で自動） | **絞っている**（下記） |
| **インフラ用**（`<プロジェクト名>-github-actions-infra-role`）。**既定では作られない** | `terraform apply`（`Deploy` を手動実行し `run_infra=true` のとき） | **広いまま**（`PowerUserAccess` + `IAMFullAccess` + tfstate） |

| ロール | GitHub Secret | 信頼条件（誰が引き受けられるか） |
|---|---|---|
| デプロイ用 | `AWS_ROLE_ARN` | `develop` ブランチのワークフロー |
| インフラ用 | `AWS_INFRA_ROLE_ARN` | Environment `infra` を使うジョブ（`sub` が `repo:<リポジトリ>:environment:infra`） |

**デプロイ用ロールが許可される操作**（移植元 `github-actions-dev` と同じ考え方。可能な限りリソースを限定）:

- ECR: ログイン、backend のリポジトリへのイメージのプッシュ
- ECS: タスク定義の取得・登録（AWS の仕様上、リソースを限定できない）、backend サービスの確認・更新、クラスタ内のタスクの確認、**マイグレーション用のタスク定義だけを、このクラスタで**一時タスクとして起動
- `iam:PassRole`: タスク実行ロール・タスクロールだけ。**ECS のタスクに渡す場合に限る**
- S3: frontend 用バケットの同期
- CloudFront: その配信のキャッシュ無効化
- 付けていないもの: tfstate へのアクセス、IAM・EC2・RDS・Secrets Manager などの操作（`terraform apply` はできない）

**残るリスク（デプロイ用ロール）**: タスク定義の登録（`ecs:RegisterTaskDefinition`。リソースを限定できない）と、タスク実行ロール・タスクロールの引き渡し（`iam:PassRole`）を許可しています。そのため、`develop` で実行されるコードは、任意のコンテナイメージ・コマンドで、これらのロールの権限のコンテナを動かせます（タスク実行ロールは Secrets Manager のシークレットを読める）。CI がタスク定義を登録してデプロイする仕組み上、避けられません（移植元も同じ）。`develop` に入るコードのレビューが、この境界を守っています。

### インフラ用ロールを使えるようにする（必要になったとき）

**インフラ用ロールは、既定では作りません**（`enable_github_actions_infra_role = false`）。理由は次のとおりです。

- このロールを引き受けられるのは「Environment `infra` を使うジョブ」だが、その `sub` にはブランチが含まれず、AWS 側の信頼条件ではブランチを固定できない
- Environment に承認者・対象ブランチの制限が付いていないと、**どのブランチのワークフローも、広い権限のロールを引き受けられてしまう**（旧ロールは `develop` に固定されていた）
- ロールが存在しなければ引き受けられないので、次の順序を守ること

手順:

1. **Environment `infra` を、先に作って保護する**。承認者を付け、対象ブランチを `develop` だけにする（下の例）。初回のインフラのデプロイで自動作成もされるが、その場合は保護が付かない
2. **ローカルで、管理者権限で**、`terraform.tfvars` に `enable_github_actions_infra_role = true` を足して `terraform apply` する（`AWS_PROFILE=oic`）。ロールを CI で作ることはできない。ロールを使うのが、ロールを作るワークフローだから
3. 出力 `github_actions_infra_role_arn` を、GitHub の Secret `AWS_INFRA_ROLE_ARN` に登録する。あわせて、GitHub の Variable `ENABLE_GITHUB_ACTIONS_INFRA_ROLE` を `true` にする。CI の `terraform plan`・`apply` に、ローカルと同じ `enable_github_actions_infra_role = true` を渡すため。未登録だと既定の false になり、CI の plan が、使用中のインフラ用ロール自身を削除してしまう
4. `Deploy` を手動実行し、`run_infra=true` にする（Environment の承認が求められる）

次は、GitHub のドキュメントに基づく例で、**実行して確認していません**。`<...>` を置き換えてください。

```bash
# 承認者(あなた)のユーザーID
gh api user --jq .id

# Environment infra を作り、承認者を付け、対象ブランチをカスタムにする
gh api -X PUT repos/<オーナー>/<リポジトリ>/environments/infra --input - <<'JSON'
{"reviewers":[{"type":"User","id":<ユーザーID>}],"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON

# 対象ブランチを develop だけにする
gh api -X POST repos/<オーナー>/<リポジトリ>/environments/infra/deployment-branch-policies -f name=develop -f type=branch
```

**インフラ用ロールの広い権限は、絞っていません**。`terraform apply` に必要な権限は、実際に `apply` を試さないと確定できず、推測で絞ると、実際の `apply` で予期しない失敗が起きるためです。**実際に `apply` する機会に、必要な権限を洗い出して絞ること**（別の変更）。

### 確認したこと・していないこと

- **確認した**: IAM のポリシーシミュレーター（読み取りのみ）で、デプロイ用ロールが、CI の実際の操作を許可し、不要な操作を拒否すること（44 件。結果は `docs/issue-388/08_動作確認.md`）
- **確認していない**:
  - 実際のデプロイでの成否。シミュレーターは権限の判定だけで、ECS のタスク定義へのタグ付けなど、実行して初めて分かる操作が漏れていると、デプロイが失敗する。**最初の実デプロイで AccessDenied が出たら、CloudTrail で拒否された操作を確認して、デプロイ用ロールに足す**こと。ECR のプッシュに必要な操作は、AWS のドキュメントの最小の組（認証、レイヤーの確認・アップロード、`PutImage`）にしてあるが、`docker buildx` での実プッシュは未確認
  - 信頼条件（ブランチ・Environment）が、AWS で期待どおりに働くこと
  - 実際の `terraform apply`。費用がかかるため、`apply` と実デプロイはしていない

## データストアの設定（RDS・ElastiCache・ECR）

移植元 `secuaigent-infra` の設定値に揃えています（#385）。

| 対象 | 設定 |
|---|---|
| RDS（PostgreSQL） | バージョン **18**（メジャーのみ指定。マイナーは AWS に任せる）、`db.t4g.micro`・gp3・20GB、**保存時に暗号化**、自動バックアップ **7 日**、自動マイナー更新あり、専用のパラメータグループ（`<プロジェクト名>-pg18`。パラメータは既定のまま）、マルチ AZ なし、公開なし、最終スナップショットなし |
| ElastiCache（Redis） | バージョン **7.1**、`cache.t4g.micro` 1 ノード、ポート 6379、**保存時の暗号化あり**、**通信の暗号化（TLS）なし**（backend が平文の `redis://` で接続しているため）、自動フェイルオーバーなし |
| ECR | タグのないイメージを、プッシュから **30 日**で削除。タグ付き（`latest`・コミット SHA）は消さない |

- **バージョンの選び方**: ローカルの開発環境（`docker-compose.yml` の `postgres:18`・`redis:7`）と、メジャーバージョンを合わせている。移植元の既定値 `16.4` は、パラメータグループ（PostgreSQL 18 用）と食い違い、現在のリージョンには存在しないため、使わない
- **マイナーバージョンは固定しない**: 自動のマイナー更新と矛盾して、更新のたびに差分が出るため
- **DB パスワード**: Terraform が自動生成する（`random_password`）。人が決めない。保存先と取得方法は、次の「シークレット（Secrets Manager）」を参照

### RDS の停止運用（7 日の自動再起動の回避）

RDS は、手動で停止しても、AWS が 7 日後に自動で再起動します。これを避けるため、毎日 09:00 に起動・09:10 に停止する EventBridge Scheduler を用意しています。

- `enable_rds_keepalive_schedule = true` にすると作られる（`modules/rds/scheduler.tf`）
- **既定では作らない**（09:10 をまたぐ作業中も止まるため）
- 使わないときは、手動で停止し、7 日以内に起動し直すこと
- 有効にした環境の適用は、`terraform apply` を手元で行う
- 運用方針の全体は、ルートの `CLAUDE.md` の「RDS の運用方針」を参照

### 注意が要る変更

- **再作成になる変更**: RDS の暗号化と ElastiCache の暗号化は、作成後に変えられない。既存の環境に適用すると、RDS・ElastiCache が再作成される（データは消える）。
  - RDS は `skip_final_snapshot = true` のため、削除時に最終スナップショットも取られず、自動バックアップもインスタンスと一緒に消える
  - 新アカウントへの新規構築が前提。既存の環境に適用する場合は、先に手動でスナップショットを取ること
  - `destroy` で環境を片づける運用のため、`prevent_destroy` は付けていない
- **メジャーバージョンを上げるとき**: `engine_version`（モジュールの入力）を変えるだけでは足りない。データの移行を伴うので、スナップショットを取ってから、手動で計画する。パラメータグループは、名前にメジャーを含み、新しいものを先に作る（`create_before_destroy`）ので、食い違わない

### pgvector・アプリ用ロール

移植元の `scripts/db-init`（pgvector の拡張とアプリ用ロールの作成）は、持ち込んでいません。

- `server/`（この RDS をアプリの DB として使う側）は、pgvector を使っていない
- `generative-ai-adapter/embedding-adapter` は、ベクトル DB の種類として「PostgreSQL(PGVector)」を扱える。ただし接続先は、アダプタの設定（`VectorDBConfig`）で指定される別の DB（`onprem/vector-db` など）で、**この RDS が自動的にその役を担うわけではない**
- この RDS をベクトル DB として使う場合は、事前に `CREATE EXTENSION vector` と、アプリ用ロールの作成が要る。別の変更として扱うこと

## シークレット（Secrets Manager）

DB の接続文字列とアプリの秘密鍵は、ECS のタスク定義に平文で持たせず、Secrets Manager のシークレット `<プロジェクト名>/backend` に保存します（#386）。ECS は、タスクの起動時に、実行ロールがここから値を取り出して、環境変数（`DATABASE_URL`・`SECRET_KEY`）として注入します。アプリのコード（`server/`）は、これまでどおり環境変数で受け取ります。

| キー | 内容 | 使う人 |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB名>`（Terraform が組み立てる） | アプリ（ECS が注入） |
| `SECRET_KEY` | アプリの秘密鍵（Terraform が生成） | アプリ（ECS が注入） |
| `DB_PASSWORD` | RDS のマスターパスワード | 人が DB に接続するとき（踏み台のシード投入など） |

**Azure の利用料金の取得 API** は、dev・staging では使えません。`AZURE_APP_*` の 5 つの環境変数が必須（`server/app/core/config.py` の `AzureCostSettings`）なのに、ECS のタスク定義にこれらを渡していないためです（呼ぶと必須値のエラーになる）。使うときは、Secrets Manager のシークレットに足して、タスク定義の `secrets` に加えます。

### 取得と読める人

- **取得**: 値が画面に出るので、取り扱いに注意すること

  ```bash
  aws secretsmanager get-secret-value --secret-id "$(terraform output -raw backend_secret_name)" --query SecretString --output text | jq
  ```

- **読める人**: タスクの**実行ロール**だけ。アプリの**タスクロール**には付けていない（アプリは環境変数で受け取るだけで、Secrets Manager を呼ばない）
- **tfstate には値が残る**: 値は Terraform が生成・保存するため、tfstate にも入る。tfstate は、非公開・暗号化の S3 バケットにある（`secuaigent-infra/bootstrap`）。今回の改善は、タスク定義・ECS のコンソール・API・CI が登録し直すタスク定義のリビジョンに、値が載らなくなること

### 値を変える・既存環境に適用する場合の注意

- **値を変える**: パスワード・秘密鍵は、Terraform が管理している。コンソールや `aws` で手で書き換えても、次の `terraform apply` で元に戻る。**変更の手順は、確認できていないため書かない**。
  - 特に RDS のパスワードは、Terraform が `apply_immediately` を既定（false）のまま変更する。そのため、次のメンテナンスウィンドウまで RDS 側に反映されず、シークレットの値と食い違って、アプリが DB に接続できなくなるおそれがある
  - 変える必要が出たら、先に手順を計画すること（別の変更で扱う）
- **既存の環境に適用してはいけない（最初の `apply` でアプリが止まる）**: この構成は、新アカウントへの新規構築が前提。**すでに RDS がある環境に適用すると**、次のことが起きる。
  - Terraform は、RDS のパスワードを新しい生成値に変えようとするが、`apply_immediately` が既定（false）のため、RDS 側には次のメンテナンスウィンドウまで反映されない
  - 一方、Secrets Manager の `DATABASE_URL` は、すぐに新しいパスワードになる。次にタスクが起動（デプロイ・再起動）すると、認証に失敗する。マイグレーションの一時タスクも、同じ理由で失敗する
  - `apply_immediately` は、バージョン変更の再起動など、ほかの変更も即時にしてしまうため、付けていない
- **過去のタスク定義のリビジョンには、旧い平文の値が残る**: 旧構成のタスク定義には、旧い接続文字列・秘密鍵が平文のまま残っていて、Terraform もこの変更も消さない。`ecs:DescribeTaskDefinition` が使える人は読める。旧い値を新環境で使い回している場合は、**漏れたものとして扱い、変える**こと。新アカウントの新規構築では、最初のリビジョンから `secrets` が使われ、平文は載らない

### 削除・費用・対象外

- **削除**: 開発用のため、シークレットの削除待ち期間はない（`destroy` 後に、同じ名前で作り直せる）。削除すると、値は復元できない
- **費用**: シークレットの保管料と API 呼び出しの料金がかかる（単価は未確認のため、金額は書かない）
- **対象外**: 自動ローテーション、顧客管理の KMS キー（既定の AWS 管理キーを使う）、DB の接続ユーザーの分離（アプリ用ロールの作成）

## コスト

ECS は **Fargate（0.5 vCPU / 1 GB、1 タスク常時稼働）+ NAT Gateway（1 台）** です。EC2（t4g.nano 1 台）だった頃より、固定費が増えます（#384。移植元と同じ構成に揃えたため）。

- **NAT Gateway**: 存在する時間に応じた固定費と、通過したデータ量に応じた費用がかかる。タスクを動かしていなくても、NAT が存在する限りかかる
- **Fargate**: タスクが動いている間、vCPU とメモリの時間に応じてかかる
- **金額は未確認**: 東京リージョンの単価を、このリポジトリでは確認できていない。見積もりは、AWS の料金ページと Pricing Calculator（リージョンは Asia Pacific (Tokyo)）で確認する。実際の請求は、Cost Explorer で確認する
- **使わないときの減らし方**:
  - ECS サービスの `desired_count` を 0 にする（Fargate の費用が止まる。NAT は残る）
  - 完全に止めるなら `terraform destroy`（NAT もなくなる）
  - RDS の停止運用は、上の「RDS の停止運用」を参照
- `terraform apply` は、CI では手動実行（`run_infra`）のときだけ動く。**マージしただけでは、費用のかかるリソースは作られない**

### NAT Gateway は 1 台のみ（単一障害点）

NAT Gateway は、1 つ目の AZ（1a）の public サブネットに 1 台だけ置き、2 つの private サブネットがどちらもそれを経由します（移植元と同じ構成）。

- **その AZ に障害が起きると、1c のタスクも含めて、ECR からのイメージ取得・ログ送信・外部 API への通信ができなくなり、新しいタスクが起動できなくなる**
- 固定費を抑えるためのトレードオフ。AZ ごとに NAT を置く構成（台数分の固定費がかかる）は、必要になったら別の機会に検討する

## destroy 時の注意

- S3 バケット（frontend）・ECR リポジトリ（backend）は、中身が入っていると `terraform destroy` が失敗する。`force_destroy`（S3）・`force_delete`（ECR）を設定済みだが、これらの属性変更を反映するため、**destroy 前に一度 `terraform apply` が必要**
- RDS は `skip_final_snapshot = true` のため、最終スナップショットを求められず、即削除される
- CloudFront の削除が最も遅い（無効化 → エッジ撤去のため 15〜40 分）。destroy 全体で 20〜45 分程度を見込む

## セキュリティグループの egress 方針

ingress（インバウンド）は、全 SG で、送信元を IP または SG 参照に厳密に絞っています。egress（アウトバウンド）は、次の方針です。

| SG | egress |
|---|---|
| bastion | RDS への 5432 番（SG 参照）+ 443 番（OS 更新用） |
| ALB | ECS への 8000 番のみ（SG 参照） |
| ECS | 全許可（ECR / ECS API / CloudWatch Logs など、広範囲かつ変わりうる AWS 管理 IP に依存するため） |
| RDS / ElastiCache | 全許可（絞る場合は個別に動作検証が必要なため、コスト対効果を踏まえ見送り） |

詳しい経緯は `docs/issue-160/08_動作確認.md` を参照。
