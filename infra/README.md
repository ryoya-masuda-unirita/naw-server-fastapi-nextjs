# infra/ 運用メモ

Issue #160 でTerraform化したAWSインフラ（dev/staging用、本番なし）の運用手順・設計判断をまとめる。

## ディレクトリ構成

```
infra/
├── route53/   # Route53ホストゾーンのみ。メインとは別state（理由は後述）
└── （このディレクトリ） # ホストゾーン以外の全リソース（VPC/ECS/RDS/ALB/CloudFront/S3など）
```

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
aws ecr get-login-password --region ap-northeast-1 --profile naw-fastapi-issue158 \
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

### 2. frontend-angularをビルドしてS3へ

```bash
cd frontend-angular
npm ci
npm run build -- --configuration dev
# 出力先: dist/secuaigent-client/browser/

aws s3 sync dist/secuaigent-client/browser/ s3://<frontend_bucket名>/ --delete --profile naw-fastapi-issue158
aws cloudfront create-invalidation --distribution-id <cloudfront配信ID> --paths "/*" --profile naw-fastapi-issue158
```

### 3. bastion経由でRDSマイグレーション＋シード投入

```bash
# ターミナル1: SSHトンネル（張ったまま維持する）
ssh -i ~/.ssh/<キーペア名>.pem \
  -L 5433:<rds_endpoint>:5432 \
  ec2-user@<bastion_public_ip>

# ターミナル2: マイグレーション
cd backend
DATABASE_URL="postgresql+asyncpg://root:<db_password>@localhost:5433/postgres" uv run alembic upgrade head

# シードデータ
PGPASSWORD=<db_password> psql -h localhost -p 5433 -U root -d postgres < backend/seed.sql
```

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
