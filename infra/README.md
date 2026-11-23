# infra/ 運用メモ

Issue #160 でTerraform化したAWSインフラ（dev/staging用、本番なし）の運用手順・設計判断をまとめる。

## ディレクトリ構成

```
infra/
├── bootstrap/ # tfstate用S3バケットのみ。メインとは別state（初回に一度だけ作る）
├── route53/   # Route53ホストゾーンのみ。メインとは別state（理由は後述）
└── （このディレクトリ） # 上記以外の全リソース（VPC/ECS/RDS/ALB/CloudFront/S3など）
```

## 初回セットアップ手順（新しいAWSアカウントへの構築時、`terraform destroy`後の再構築時も同様）

tfstate用S3バケットは、メインの`infra/`構成とは別のstate（`infra/bootstrap/`）で管理する。メインがバケットを管理すると、`terraform destroy`で「stateの置き場所」ごと消え、バケットが無い状態から作り直す必要があったため。メインを`destroy`してもstateは残る（`prevent_destroy`付き）。

ローカルでは`AWS_PROFILE=oic`を環境変数で指定して実行する（`.tf`にはprofileを固定しない。CIはOIDCの一時クレデンシャルを使うため）。

1. **state用バケットを作る（初回のみ）**

   ```bash
   cd infra/bootstrap
   AWS_PROFILE=oic terraform init
   AWS_PROFILE=oic terraform apply
   AWS_PROFILE=oic terraform output -raw backend_config > ../backend.hcl
   ```

   バケット名は`<project_name>-tfstate-<AWSアカウントID>`になる。`bootstrap/`の`terraform.tfstate`（ローカル）は消さないこと。消えた場合は`terraform import`で復元する。`../backend.hcl`は`.gitignore`済みで、git管理しない（雛形は`backend.hcl.example`）。

2. **メイン構成を初期化する**

   ```bash
   cd infra
   AWS_PROFILE=oic terraform init -backend-config=backend.hcl
   ```

3. `terraform.tfvars`を用意する（`terraform.tfvars.example`を参考に。`tfstate_bucket_name`には手順1のバケット名を入れる）
4. `AWS_PROFILE=oic terraform apply`を実行する
5. 以降は通常どおり`terraform plan`/`apply`/`destroy`を使う（S3ネイティブロックにより複数人での同時applyも安全）

### Route53（もう不要）

以前は上記に加えて`infra/route53/`でのホストゾーン作成・ムームードメイン側のネームサーバー登録も初回セットアップに含まれていたが、Issue #195でカスタムドメイン運用自体を廃止したため、現在は不要（詳細は次のセクション参照）。CloudFrontはデフォルトドメイン（`*.cloudfront.net`）でそのまま使える。

### GitHub Actionsからのデプロイ（CI/CD）の初回セットアップ

`.github/workflows/deploy.yml`は、`develop`へのpushでは**backend/frontendだけ**を自動デプロイする。**インフラ（`terraform apply`）は自動では実行されない**（構成の作り直し中に意図せず適用されるのを防ぐため。#381）。インフラを反映するときは、Actionsタブの`Deploy`を手動実行し、`run_infra`をtrueにする（`gh workflow run deploy.yml -f run_infra=true`）。

#### 1. 前提: 上記の初回セットアップ手順で`terraform apply`済みであること

#### 2. GitHub Secrets / Variables を登録する

デプロイに使うSecrets/Variablesのうち、`AWS_ROLE_ARN`・`FRONTEND_BUCKET_NAME`・`CLOUDFRONT_DISTRIBUTION_ID`は`terraform output`で取得できる。それ以外（`DB_PASSWORD`等）は`terraform.tfvars`と同じ値を使う。`gh` CLI（[GitHub CLI](https://cli.github.com/)、要ログイン済み）で以下のように一括登録できる。

```bash
cd infra

# terraform outputから取得できるもの
gh secret set AWS_ROLE_ARN --body "$(terraform output -raw github_actions_role_arn)"
gh variable set FRONTEND_BUCKET_NAME --body "$(terraform output -raw frontend_bucket_name)"
gh variable set CLOUDFRONT_DISTRIBUTION_ID --body "$(terraform output -raw cloudfront_distribution_id)"

# terraform.tfvarsと同じ値を使うもの（<...>は実際の値に置き換える）
gh secret set DB_PASSWORD --body "<terraform.tfvarsのdb_password>"
gh secret set SECRET_KEY --body "<terraform.tfvarsのsecret_key>"
# ALLOWED_SSH_CIDRS/ALLOWED_ADMIN_CIDRSはlist(string)型のvariableのため、TF_VAR_経由で渡す値は
# カンマ区切り文字列ではなくHCL/JSON配列表記にすること（例: ["1.2.3.4/32","5.6.7.8/32"]）。
# カンマ区切り文字列を渡すと"Invalid number literal"等のパースエラーでterraform planが失敗する。
gh secret set ALLOWED_SSH_CIDRS --body "<terraform.tfvarsのallowed_ssh_cidrsをそのままコピー、例: [\"1.2.3.4/32\"]>"
gh secret set ALLOWED_ADMIN_CIDRS --body "<terraform.tfvarsのallowed_admin_cidrsをそのままコピー、例: [\"1.2.3.4/32\"]>"
gh variable set KEY_PAIR_NAME --body "<terraform.tfvarsのkey_pair_name>"
# bootstrapで作ったstate用バケット名（deploy-infra.ymlのterraform initとplan/applyで使う。未登録だとインフラのジョブは失敗する）
gh variable set TF_STATE_BUCKET --body "$(terraform -chdir=bootstrap output -raw state_bucket_name)"

# GitHub Projects連携用(project-status-sync.ymlが使用。デプロイとは別用途。未登録なら要発行)
gh secret set PROJECT_PAT --body "<repo・project権限を持つPersonal Access Token>"
```

登録済みか確認する場合は `gh secret list` / `gh variable list` を使う。

> `DOMAIN_NAME`変数はIssue #195のカスタムドメイン廃止に伴い不要になり、`deploy-infra.yml`からも参照を削除済み。登録不要。

#### 3. 動作確認

`develop`に適当な変更をpushし、Actionsタブで`Deploy`ワークフローが起動し、変更のあった`backend`/`frontend`のジョブが成功すること（`infra`ジョブはスキップされること）を確認する。インフラは`gh workflow run deploy.yml -f run_infra=true`で手動起動して確認する。

## なぜRoute53だけ別ディレクトリ（別state）にしているか

**（Issue #195以降、メインの`infra/`構成からは独自ドメインを一切参照しなくなり、以下は`infra/route53/`にのみ関係する過去の経緯）**

**「メイン側で気軽に`terraform destroy`しても、Route53ホストゾーンだけは絶対に消えないようにするため」。**

- Route53ホストゾーンは、作成時に発行されるNSレコードをムームードメイン側に手動登録する必要がある（後述）
- ホストゾーンを消すとNSが変わり、再登録＋DNS伝播待ち（数時間〜48時間）が再び必要になる
- 動作確認のたびにメイン側のリソース（ECS/RDS等）は作っては壊す運用にしたいが、そのたびにNSを再登録するのは非現実的
- そこで、ホストゾーンだけ**別state**に切り出し、メイン側は`data "aws_route53_zone"`で**参照のみ**にした

```
【最初の1回だけ】
cd infra/route53 && terraform apply   # ホストゾーン作成、NS取得してムームーに登録

【以降、何度でも】
cd infra && terraform apply/destroy   # ホストゾーンは data参照のみなので絶対に消えない
```

`lifecycle { prevent_destroy = true }`という手もあったが、これは`terraform destroy`（引数なし）自体が使えなくなる（`-target`が必須になる）副作用があるため、state分離の方を採用した。

Issue #195でカスタムドメイン運用自体を廃止し、メイン側は`data "aws_route53_zone"`の参照も含め独自ドメインへの依存を完全に無くした。`infra/route53/`のホストゾーンはメイン構成から孤立した状態で残っており、完全に不要と判断すれば`infra/route53/`で個別に`terraform destroy`してよい（残しておいても月額$0.50程度）。

## ムームードメイン側の設定（Issue #195で不要化。`infra/route53/`を使い続ける場合のみ参照）

- ドメイン: `secuaigent-ryoyamasuda.tech`
- ムームードメインの「ネームサーバ設定変更」で「**GMOペパボ以外のネームサーバを使用する**」を選択し、`infra/route53/`で作成したホストゾーンのNS4つ（`terraform output name_servers`で確認）を登録する
- 反映確認: `dig NS secuaigent-ryoyamasuda.tech @8.8.8.8 +short` でAWSのNS（`awsdns`を含むもの）が返れば反映済み。反映には数分〜数時間かかる（伝播中はムームー側のデフォルトNSが返る）
- **自動更新設定**: ムームードメインの「ドメイン一覧」→ 対象ドメインをクリック→ドメイン詳細画面に「自動更新」の状態が表示される。デフォルトは「未設定」（＝自動更新オフ）。`.tech`ドメインは初年度が安く2年目以降の更新料が高い（$6,800/年相当）ため、意図しない自動更新課金を避けたい場合は「未設定」のままにしておく

## Route53のNSレコードとホストゾーンの料金

- ホストゾーン: 最初の25ゾーンまで $0.50/月（日割りなし）。**作成から12時間以内に削除すれば無料**（[AWS公式](https://aws.amazon.com/route53/pricing/)）
- DNSクエリ: 100万クエリあたり$0.40（動作確認レベルの利用では実質無視できる額）
- NSレコード自体は「担当DNSサーバーの指名」であり、Route53側では課金対象ではない（ホストゾーンの存在自体に対する課金）

## デプロイ手順（apply後に必要な作業）

`terraform apply`はインフラの「箱」を作るだけで、中身（アプリ）は空。以下の作業が別途必要。

### 1. backendイメージをECRへpush

ECSはARM64（Graviton, t4g.nano）のため、**`--platform linux/arm64`が必須**（付け忘れるとECSで`exec format error`になる）。

```bash
aws ecr get-login-password --region ap-northeast-1 --profile oic \
  | docker login --username AWS --password-stdin <ECRリポジトリURL の アカウントID部分>

cd backend
docker build --platform linux/arm64 -t <ecr_repository_url>:latest .
docker push <ecr_repository_url>:latest
```

push後、ECSはタスク起動失敗のリトライで自動的に`:latest`をpullして起動する（数分）。**2回目以降**の更新では自動で入れ替わらないため、以下で明示的に再デプロイする。

```bash
aws ecs update-service --cluster <cluster名> --service <service名> --force-new-deployment
```

**CORS設定（`CORS_ALLOWED_ORIGINS`）を変更した場合の注意**: `aws_ecs_task_definition.backend`には`lifecycle { ignore_changes = [container_definitions] }`が設定されており、CIが現在登録済みのタスク定義をそのまま複製してイメージタグだけ差し替える運用のため、環境変数の変更は`terraform apply`だけでは既存環境に反映されない。次のいずれかが必要。

- 環境自体を作り直す（`terraform destroy` → `terraform apply`）
- 壊さずに反映したい場合は、CIと同様に手動でタスク定義を再登録する

```bash
aws ecs describe-task-definition --task-definition <family名> --query 'taskDefinition' > task-definition.json
# Terraformで生成した最新のcontainer_definitionsを反映させたJSONを用意した上で
aws ecs register-task-definition --cli-input-json file://task-def-clean.json
aws ecs update-service --cluster <cluster名> --service <service名> \
  --task-definition <上記で払い出されたARN> --force-new-deployment
```

### 2. frontend（React）をビルドしてS3へ

通常は`develop`へのpush時に`deploy-frontend.yml`のCI/CDで自動実行される。手動で配信する場合は以下。

```bash
cd frontend
npm ci
npm run build
# 出力先: dist/
# frontend/.env.production で VITE_API_URL を空にしているため、APIは配信元(CloudFront)と同じオリジンの
# 相対パスで呼ばれ、CloudFrontがbackend(ALB)へ転送する。認証API(/auth/*)はReactの画面(/auth/login 等)と
# 同じパスのため VITE_AUTH_API_URL=/backend を付けて /backend/auth/* で呼び、CloudFront Functionで
# /backend を外してbackendへ渡す(#240)。それ以外のパスはS3から配信し、画面パス(拡張子なし)は
# CloudFront Functionでindex.htmlに書き換える(APIの403/404等はindex.htmlに置き換えない)

aws s3 sync dist/ s3://<frontend_bucket名>/ --delete --profile oic
aws cloudfront create-invalidation --distribution-id <cloudfront配信ID> --paths "/*" --profile oic
```

### 3. bastion経由でシード投入

DBマイグレーション（`alembic upgrade head`）自体はIssue #197以降、`deploy-backend.yml`のCI/CDで自動実行される（backendのデプロイのたびに、backendサービス更新の前に自動で適用される）。

シードデータ（`seed.sql`）投入は非冪等（再実行で重複・エラーの恐れ）なため引き続きCI/CDには含めず、環境構築時（destroy後の再構築時含む）にスクリプトで手動実行する。

```bash
PEM_KEY_PATH=~/.ssh/<キーペア名>.pem DB_PASSWORD=<db_password> \
  bash infra/scripts/seed_via_bastion.sh
```

- `terraform output`から`rds_endpoint`・`bastion_public_ip`を自動取得し、SSHトンネルの確立→マイグレーション適用→`seed.sql`投入→トンネルの後始末まで1コマンドで行う
- CI/CDで既にマイグレーション済みの場合は、`--skip-migrate`を付けてseed投入のみ行うこともできる

```bash
PEM_KEY_PATH=~/.ssh/<キーペア名>.pem DB_PASSWORD=<db_password> \
  bash infra/scripts/seed_via_bastion.sh --skip-migrate
```

**実際のAIエンドポイント接続情報を使いたい場合**: `infra/scripts/.env.example`を`infra/scripts/.env`としてコピーし（`.gitignore`対象、コミットしないこと）、`AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_ENDPOINT`に実際の値を設定してから実行する。seed投入後、`AZURE_OPENAI_CHAT`/`AZURE_OPENAI_EMBEDDING`エンドポイントの`api_key`・`endpoint`が実際の値で上書きされる（`seed.sql`自体はダミー値のまま変更しない）。

### 4. 動作確認

`terraform output cloudfront_domain_name`で確認したCloudFrontのデフォルトドメイン（`https://<distribution-id>.cloudfront.net/`）にアクセスする。テナントIDはURL（サブドメイン）からではなく、ログイン画面で入力する（Issue #193）。

## destroy時の注意

- S3バケット（frontend）・ECRリポジトリ（backend）は、中身が入っている状態だと`terraform destroy`が失敗する。`force_destroy`（S3）・`force_delete`（ECR）を設定済みなので、これらの属性変更を反映するため**destroy前に一度`terraform apply`が必要**
- RDSは`skip_final_snapshot = true`のため最終スナップショットを求められず即削除される
- CloudFrontの削除が最も遅い（無効化→エッジ撤去のため15〜40分）。destroy全体で20〜45分程度を見込む
- メイン側の`terraform destroy`はRoute53ホストゾーンには影響しない（別state・Issue #195以降は参照すらしていないため）。ホストゾーンごと消したい場合のみ`infra/route53/`で別途`terraform destroy`する

## セキュリティグループのegress方針

ingress（インバウンド）は全SGで送信元をIPまたはSG参照に厳密に絞っている。egress（アウトバウンド）は以下の方針。

| SG | egress |
|---|---|
| bastion | RDSへの5432番（SG参照）+ 443番（OS更新用） |
| ALB | ECSへの8000番のみ（SG参照） |
| ECS | 全許可（ECR/ECS API/CloudWatch Logs等、広範囲かつ変わりうるAWS管理IPに依存するため） |
| RDS / ElastiCache | 全許可（絞る場合は個別に動作検証が必要なため、コスト対効果を踏まえ見送り） |

詳しい経緯は `docs/issue-160/08_動作確認.md` を参照。
