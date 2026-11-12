# AWS使用リソース調査結果

調査日: 2026-07-15

調査対象:
- `~/Documents/naw-server`（Spring Boot、移植元バックエンド）
- `~/Documents/secuaigent-client`（Angular、移植元フロントエンド）
- 本モノレポ（`naw-server-fastapi-nextjs`）自体（`backend/`・`frontend-angular/`・CI/CD）

調査方法: 各リポジトリのソースコード・`pom.xml`/`package.json`依存関係・`application*.yml`設定・`.github/workflows/`・Terraform/`infra/`ディレクトリの有無を横断的に確認。**`main`（`naw-server`は`master`）ブランチと`develop`ブランチの両方を`git diff`/`git show`で比較**し、ブランチによる差異も確認した。

---

## まとめ（結論）

| 観点 | 状況 |
|---|---|
| IaC（Terraform） | **3リポジトリすべてに存在しない**。`*.tf`ファイル・`terraform/`ディレクトリともに0件（`main`/`develop`とも同じ） |
| 移植元（naw-server/secuaigent-client）でのAWS利用 | あり（S3・SQS・RDS・ECR・ECS・CloudFront、IAM OIDC）。**ただし`develop`ブランチのみ**。`main`/`master`には未マージ |
| 本モノレポ（FastAPI/React）でのAWS利用 | **まだ実装されていない**（後述） |

移植元2リポジトリはAWSリソースをコード・CI/CDの両方で直接使用しているが、Terraform等のIaCによる管理はされておらず、AWSコンソール上で手動構築されたリソースをCI/CDから参照している状態と推測される（`.github/workflows`が`vars.ECS_CLUSTER`のようなGitHub Actions変数や`secrets.AWS_*`を前提にしている＝リソース自体はワークフロー外で事前に存在している）。

**重要**: 以下1・2章の内容は`naw-server`/`secuaigent-client`の**`develop`ブランチ**を対象にした調査結果。両リポジトリとも`main`/`master`ブランチには、S3・SQS連携やCI/CDデプロイ設定がまだ存在しない（詳細は「5. ブランチ間の差異」参照）。本モノレポの移植方針は「移植元の最新実装を追従する」ため参照先は`develop`で問題ないが、**「今どのAWSリソースが本番稼働中か」を知りたい場合は`main`/`master`側（＝現時点ではAWSリソース利用なし）を見る必要がある**点に注意。

---

## 1. `naw-server`（Spring Boot）

### 1-1. 依存ライブラリ（`pom.xml`）

```xml
<aws-sdk.version>2.20.0</aws-sdk.version>
<spring-cloud-aws.version>3.0.0</spring-cloud-aws.version>

software.amazon.awssdk : s3
software.amazon.awssdk : sqs
software.amazon.awssdk : url-connection-client
io.awspring.cloud       : spring-cloud-aws-starter-s3
io.awspring.cloud       : spring-cloud-aws-starter-sqs
```

AWS SDK for Java v2 + Spring Cloud AWS。用途はS3・SQSのみ（Bedrock・SES・KMS・DynamoDB・CloudWatch等のSDKは未使用、コード内にも一切参照なし）。

### 1-2. Amazon S3（ユーザー一括インポートのCSVファイル置き場）

- 実装: `config/S3Config.java`（`S3Client`のBean定義）、`service/S3Service.java`（upload/download/delete）
- バケット名（`application.yml`）:
  - dev: `secuaigent-user-import-jobs-dev`（環境変数 `AWS_S3_BUCKET_NAME` で上書き可）
- 認証: 環境変数 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` が未設定の場合はデフォルトの認証プロバイダー（IAMロール等）にフォールバック
- リージョン: `ap-northeast-1`固定

### 1-3. Amazon SQS（ユーザー一括インポートの非同期処理キュー）

- 実装: `config/SqsConfig.java`（`SqsClient`のBean定義）、`config/SqsListenerConfig.java`、`service/UserImportQueueService.java`
- キュー名/URL（`application.yml`・`application-development.yaml`・`application-production.yaml`）:
  - dev: `secuaigent-user-import-jobs-queue-dev`
    - 実URL例: `https://sqs.ap-northeast-1.amazonaws.com/268015775231/secuaigent-user-import-jobs-queue-dev`
  - production: `AWS_SQS_QUEUE_URL`（環境変数必須、値はリポジトリ内には記載なし）
- `aws.sqs.listener-enabled`・`aws.user-import.mock-enabled`設定で、S3/SQSを使わないモック動作（DBに直接PENDING保存）も可能

### 1-4. Amazon RDS（PostgreSQL）

- `application-production.yaml`のデータソースURLに実エンドポイントが直書きされている:
  ```
  jdbc:postgresql://secuaigent-production.crgweasqewvk.ap-northeast-1.rds.amazonaws.com:5432/postgres
  ```
- development環境は`DB_HOST`/`DB_PORT`/`DB_NAME`環境変数で外部化（RDSかどうかは実行環境依存）

### 1-5. Amazon ECR / ECS（CI/CD、`.github/workflows/`）

- **`push-to-ecr.yml`**（`master`ブランチpush契機）
  - IAM OIDC: `role-to-assume: arn:aws:iam::268015775231:role/GitHubActionsRole`
  - ECRリポジトリ: `secuaigent-server`（存在しなければ`aws ecr create-repository`で作成）
  - イメージタグ: コミットSHA・ブランチ名・`latest`の3種類をpush
- **`deploy-dev-ecs.yml`**（`develop`ブランチpush契機、`workflow_dispatch`も可）
  - IAM OIDC: `secrets.AWS_ROLE_ARN`
  - ECRリポジトリ: `vars.ECR_REPOSITORY`（GitHub Actions変数、リポジトリ名は非公開）
  - ECSクラスタ/サービス: `vars.ECS_CLUSTER`/`vars.ECS_SERVICE`
  - 既存タスク定義を取得→イメージだけ差し替えて新タスク定義を登録→`ecs update-service`→`services-stable`待ち、という手動デプロイ相当のシェルスクリプト実装（CodeDeploy等は未使用）

### 1-6. AWSアカウント/リージョン

- アカウントID: `268015775231`（IAMロールARN・SQS URLから判明）
- リージョン: `ap-northeast-1`（全箇所固定）

### 1-7. 補足: Azure（AWSではないが混同注意）

- `pom.xml`に`com.azure.resourcemanager:azure-resourcemanager-costmanagement`があり、Azure Cost Management APIを使ったコスト集計機能（`azure_cost_client`相当）が別途存在する。これはAWSリソースではないため本調査の対象外だが、クラウドを跨いだ構成になっている点は留意。

---

## 2. `secuaigent-client`（Angular）

### 2-1. アプリケーション本体

- `package.json`にAWS SDK系の依存は**一切なし**。フロントエンドはバックエンド（naw-server）のAPIのみを呼び出す構成で、ブラウザから直接AWSリソースへアクセスするコードは存在しない。

### 2-2. CI/CD（`.github/workflows/deploy-dev.yml`）— S3 + CloudFront

- `develop`ブランチpush契機（`workflow_dispatch`も可）
- IAM OIDC: `secrets.AWS_ROLE_ARN`
- **Amazon S3**: `secrets.AWS_S3_BUCKET`に対し、ビルド成果物（`dist/example/browser`）を`aws s3 sync`。HTML/JSONのみ`max-age=0, must-revalidate`、それ以外は`max-age=31536000`（1年キャッシュ）というキャッシュ戦略の作り分けあり
- **Amazon CloudFront**: `secrets.AWS_CLOUDFRONT_DISTRIBUTION_ID`に対し`aws cloudfront create-invalidation --paths "/*"`で全パスキャッシュ無効化
- リージョン: `ap-northeast-1`
- バケット名・ディストリビューションIDは両方ともGitHub Secretsで管理されておりリポジトリ内には実値なし

---

## 3. Terraform / IaC

- `naw-server`・`secuaigent-client`・本モノレポの3リポジトリを対象に`*.tf`・`terraform/`・`infra/`を検索したが、**該当ファイル・ディレクトリは1つも存在しない**（本モノレポの`.claude/CLAUDE.md`には「IaC: Terraform（`infra/`ディレクトリ）」という**計画**が記載されているが、実体はまだ作成されていない）
- 移植元2リポジトリのCI/CDは、ECRリポジトリ名・ECSクラスタ/サービス名・S3バケット名・CloudFrontディストリビューションIDをGitHub ActionsのVariables/Secretsとして参照するのみで、リソースそのものの作成・変更を行うステップは（ECRの`describe-repositories || create-repository`のフォールバック以外）含まれていない。→ **AWSリソースは手動（コンソール操作等）で構築され、CI/CDはデプロイのみを担当している**と推測される。

---

## 4. 本モノレポ（`naw-server-fastapi-nextjs`）自体の現状

移植先のFastAPI/Reactでは、**AWSリソースの実装はまだ移植されていない**。

- `backend/app/core/file_storage.py`:
  - `LocalFileStorage`という暫定実装のみ存在し、ローカルディスクにファイルを保存する形。docstringにも「インフラ（AWS S3バケット等）が未整備な現時点の暫定実装」「S3等への移行時は`FileStorage`を実装する別クラスに差し替えるだけでよい設計」と明記されており、S3移行を見越した抽象化（Protocol）だけが先行して用意されている状態
- `backend/app/services/user_import_service.py`:
  - 移植元のS3+SQSによる非同期構成とは異なり、アップロードされたCSVを同期的に検証・DB登録する簡略構成（コメントにその旨明記）
- `backend/pyproject.toml`に`boto3`等のAWS SDK依存は**なし**
- `.github/workflows/`は`backend-tests.yml`（単体・結合テスト）と`project-status-sync.yml`（GitHub Projectsステータス自動更新）のみで、AWSへのデプロイを行うワークフローは存在しない
- `frontend-angular/.github/workflows/deploy-dev.yml`は`secuaigent-client`から取り込んだファイルだが、**全行コメントアウトされて無効化**されている（先頭コメント: 「モノレポ統合のため無効化。別リポジトリ用のデプロイ設定を参考として残す」）

`.claude/CLAUDE.md`に記載の以下の構成は現時点では**計画のみ**で、コード・IaCとしての実体はない。

```
フロントエンド: CloudFront + S3
バックエンド:   AWS ECS（EC2起動タイプ、t4g.nano）
DB:            Amazon RDS PostgreSQL（db.t4g.micro）
コンテナレジストリ: Amazon ECR
IaC:           Terraform（infra/ディレクトリ）
CI/CD:         GitHub Actions + OIDC
リージョン:     ap-northeast-1
```

（本セッション冒頭で言及されたpgAdmin4経由のRDS調査は、この計画上のRDSインスタンスに接続したものだが、実際には移植元Spring Boot用のデータベースであり、本モノレポ用のRDSインスタンスとは別物だった点に注意。）

---

## 5. ブランチ間の差異（`main`/`master` vs `develop`）

### 5-1. `naw-server`（`master` vs `develop`）

`git diff master..develop`で確認したところ、**S3/SQS関連の実装は`develop`ブランチにのみ存在し、`master`にはまだ存在しない**。

| ファイル | `master` | `develop` |
|---|---|---|
| `pom.xml`のAWS依存（`software.amazon.awssdk`等） | なし | あり |
| `application.yml`/`application-development.yaml`/`application-production.yaml`の`aws:`セクション | なし | あり |
| `config/S3Config.java`・`config/SqsConfig.java`・`service/S3Service.java` | なし | あり |
| `.github/workflows/push-to-ecr.yml`（ECRへのイメージpush） | **あり**（既存） | あり |
| `.github/workflows/deploy-dev-ecs.yml`（ECSへの自動デプロイ） | なし | あり |
| Liquibaseの`user_import_jobs`テーブル等 | なし（`develop`で新設） | あり |

→ ECRへのイメージpush（ビルド成果物の保管）自体は`master`でも既に行われているが、**S3/SQSを使ったユーザー一括インポート機能、およびECSへの自動デプロイの仕組みは、まだ本番相当の`master`にはマージされていない開発中の機能**。

### 5-2. `secuaigent-client`（`main` vs `develop`）

`git diff main..develop`で確認したところ、**`.github/workflows/deploy-dev.yml`（S3+CloudFrontへのデプロイ）自体が`develop`にしか存在しない**（`main`には`.github/workflows/`ディレクトリごと存在しない）。`package.json`の差分はチャート/Markdown描画ライブラリやテスト基盤（vitest等）の追加であり、AWSとは無関係。

### 5-3. 本モノレポ（`main` vs `develop`、参考）

`git diff origin/main..origin/develop`で確認したところ、`.github/workflows/backend-tests.yml`・`project-status-sync.yml`・`docker-compose.yml`は`develop`にのみ存在する（`main`はほぼ初期状態）。いずれもAWSとは無関係（テストCI・GitHub Projects連携・ローカル開発用docker-compose）。本モノレポの運用は「実装は`develop`で進め、都度PRでマージしていく」前提のため、この差異自体は想定どおり。

---

## 参考: 検索コマンド例

```bash
# Terraformファイルの有無
find <repo> -iname "*.tf" -o -iname "*terraform*"

# AWS SDK依存の確認（Java）
grep -n -i "aws\|s3\|sqs" pom.xml

# AWS SDK依存の確認（Angular）
grep -n -i "aws" package.json

# CI/CDワークフローの確認
find .github/workflows -type f
```
