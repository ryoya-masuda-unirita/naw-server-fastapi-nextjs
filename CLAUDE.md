# naw-server-fastapi-nextjs — Claude 向けプロジェクト設定

@.claude/memory/MEMORY.md

## プロジェクト概要

企業向け AI チャット管理 SaaS の**移植プロジェクト**。

移植元は GitLab のモノレポ `secuaigent`（製品名 SecuAiGent、旧称 NAW）。複数のプロジェクトが入っており、すべて移植対象とする。

| 移植元（`~/Documents/unirita-develop-pj/secuaigent-ref/` 配下） | 移植先（このリポジトリ） |
|---|---|
| `server/`（Spring Boot 3.5 / Java 21） | `backend/`（FastAPI） |
| `client/`（Angular 21） | `frontend/`（React、Vite + React Router） |
| `generative-ai-adapter/`（Java。Waha! 向けの生成AI・埋め込み・検索アダプター） | `generative-ai-adapter/`（Python、新設予定） |
| `secuaigent-server-local/`（Java。オンプレ配布用サーバー） | `server-local/`（Python / FastAPI + SQLite。Linux（Docker）で動かす。#210 で新設。手順は `server-local/README.md`） |
| （移植元なし。Waha! 本体はユニリタの製品で、どちらのリポジトリにもない） | `waha-emulator/`（Python / FastAPI。Waha! の servicerun API の代わり。server-local から SECURE のチャットを通しで動かすために #274 で新設。アダプタはここのワークフローに差し込む。手順は `waha-emulator/README.md`） |
| `secuaigent-infra/`・`e2e-test/`・`ops-scripts/`・`ci-runner/`・`test-reporting/`・`documents/` | 移植先は着手時に決める（`secuaigent-infra/` とこのリポジトリの `infra/` の関係も着手時に確認する） |

`frontend-angular/`（`secuaigent/client` のコピー。React 移植完了までの backend 動作確認用）は Issue #213 で削除した。backend の動作確認は自動テスト、または React（`frontend/`）の移植済み画面で行う。

**両参照リポジトリは日々更新される**。実装前に必ず参照リポジトリの最新状態を確認し、現時点の実装を把握してからポートすること。

ポート作業を行う際は、対応する参照リポジトリのコミット履歴（`git log`）を確認し、何がどの粒度で実装されたかを把握した上でチケット・実装方針を決めること。複数のコミットをまとめてポートしてもよい。

### 参照リポジトリ（参照専用 worktree）

- `~/Documents/unirita-develop-pj/secuaigent` はユーザーが業務で使う作業ツリー（作業中のブランチが checkout されている）。**ここで `git checkout` / `git pull` をしない**
- 参照には、同じリポジトリの参照専用 worktree `~/Documents/unirita-develop-pj/secuaigent-ref`（`origin/develop` に detached）を使う。最新化は次のとおり（作業ツリーのブランチには影響しない）

  ```bash
  git -C ~/Documents/unirita-develop-pj/secuaigent fetch origin develop
  git -C ~/Documents/unirita-develop-pj/secuaigent-ref checkout --detach origin/develop
  ```

- worktree がない場合は `git -C ~/Documents/unirita-develop-pj/secuaigent worktree add --detach ../secuaigent-ref origin/develop` で作る
- `secuaigent-ref` は読むだけにする。ファイルの変更・コミット・push・MR 作成はしない（GitLab の `secuaigent` に Issue・MR を作らない）

| ディレクトリ | git 管理状況 |
|---|---|
| `server/` | 最初から git 管理（2024-03〜）。`git log` で全履歴を追える |
| `client/` | 2026-07-13 にモノレポへ取り込まれた。それ以前（別チームの初期実装を含む）は履歴を追えない場合がある。最新のコードを読んで実装を把握すること |
| その他 | モノレポへの取り込み時期はディレクトリごとに異なる。必要に応じて `git log -- <dir>` で確認する |

---

## テナント識別方式（サブドメイン廃止・移植/調査時の前提条件）

**このプロジェクトはテナント識別にサブドメイン（`window.location.hostname` 等）を使わない。** Issue #193（当時の Angular 版フロント。#213 で削除）・#195（infra）で、サブドメインを前提とした実装を意図的に廃止した。

| 対象 | 廃止内容 | 現在の方式 |
|---|---|---|
| frontend（React） | hostname パースは持たない（#193 で Angular 版から撤去した `resolveTenantId()` の hostname パース・`extractTenantIdFromHostname()` 相当は移植しない） | **方針**: ログイン画面でテナントIDを明示入力 → `sessionStorage` 保存 → `X-Tenant-ID` ヘッダ送信（#193 で Angular 版に入れた方式。React にも同じ方式が必要）。**現状（#213 時点）**: ログイン画面にテナントID入力欄がない。`X-Tenant-ID` は `sessionStorage` の `TENANT_ID` があるときだけ送り、`TENANT_ID` はログイン後に `GET /api/auth` のレスポンスの `tenant_id` から保存する作りになっている。しかし backend は `POST /auth/login`・`GET /api/auth` とも `X-Tenant-ID` 必須で、`GET /api/auth` のレスポンス（`AuthResponse`）に `tenant_id` もないため、この流れは成り立たず React からはログインできない。テナントID入力欄の移植と、入力したテナントIDを `sessionStorage` に保存してログイン・セッション取得の両方で送る修正が必要（未対応） |
| infra（Issue #195） | Route53ホストゾーン、ACM証明書（ワイルドカードSAN）、CloudFrontエイリアス、ワイルドカードCORS正規表現 | CloudFrontデフォルトドメイン（`*.cloudfront.net`）配信、固定オリジンのCORS |

**参照リポジトリ（`secuaigent/client` / `secuaigent/server`）はサブドメインを廃止していない。** サブドメイン廃止はこのリポジトリ側だけの意図的な決定であり、参照リポジトリの実装が古い／未移植なわけではない。実際、`secuaigent/client` の `tenant.helpers.ts` は今も hostname フォールバックを持つ（このリポジトリでは #193 で当時の Angular 版から撤去し、Angular 版自体も #213 で削除した。React 側にも持ち込まない）。

- **未移植判定からの除外（最重要）**: `naw-explore` / `naw-frontend-explore` や Issue 一括起票系 skill（`naw-issue-batch` / `naw-frontend-issue-batch`）で参照リポジトリとの差分を検出する際、サブドメイン（hostname）ベースのテナント識別・ワイルドカードDNS/証明書前提の設計は「未移植の欠落」として検出・Issue化しない。意図的に廃止したものであり、差分として存在すること自体が正しい状態
- 逆に、参照リポジトリの調査・読解自体（挙動理解、無関係な機能のリサーチ等）では通常どおりサブドメイン前提のコードも含めてそのまま読む。除外するのは「未移植候補としての検出」の場面に限る
- 実際に移植作業でサブドメイン依存のロジックに行き当たった場合は、そのまま持ち込まず実装前に一言確認する

---

## 現在の開発方針

**バックエンド（`backend/`）とフロントエンド（`frontend/`、React）を並行して進める。**（2026-11-12 改定。それまでは「バックエンド優先・`frontend/` は当面不問」だった）

- `backend/` と `frontend/` の Issue は、どちらも通常どおり起票・対応してよい。`frontend/` の不具合を見つけた場合も起票・修正の対象にする
- 新しく移植対象に加わった `generative-ai-adapter/`・`server-local/`・その他のモジュールは、着手（Issue 起票を含む）前に優先順位をユーザーに確認する
- 新しいチケットに着手する際は、Issue の内容から対象モジュール（`backend/` / `frontend/` / その他）を判断する。判断に迷う場合だけユーザーに確認する
- バックエンドの動作確認は、自動テスト（`uv run pytest`）、または React（`frontend/`、`http://localhost:5173`）の移植済み画面で行う。未移植の画面が必要な確認は自動テストで代替する

---

## クラウドインフラ

**環境: dev/staging のみ（本番環境なし）**

| レイヤー | 選定 |
|---|---|
| フロントエンド | CloudFront + S3（SPA 静的デプロイ） |
| バックエンド | AWS ECS（EC2 起動タイプ、t4g.nano）※ メモリ不足時は t4g.micro に変更 |
| DB | Amazon RDS PostgreSQL（db.t4g.micro） |
| コンテナレジストリ | Amazon ECR |
| IaC | Terraform（`infra/` ディレクトリ） |
| CI/CD | GitHub Actions + OIDC（IAM ロール） |
| リージョン | ap-northeast-1 |

### RDS の運用方針

コスト削減のため RDS は**デフォルト停止**。作業前に手動で起動し、終わったら停止する。

```
通常時: 停止（ストレージ代のみ ~$2〜3/月）
作業時: 手動起動 → 使用 → 手動停止
```

**7日自動再起動の回避策**

RDS を手動停止すると AWS が7日後に自動で再起動する制約がある。これを避けるため、EventBridge Scheduler で毎日1回10分間だけ起動・停止するスケジュールを設定する。

```
毎日 09:00 JST → RDS 起動
毎日 09:10 JST → RDS 停止
```

これにより7日連続停止が発生せず、自動再起動は起きない。

---

## モノレポ構成

```
naw-server-fastapi-nextjs/
├── frontend/          # React（Vite + React Router、client/ の移植先）
├── backend/           # FastAPI（server/ の移植先）
├── server-local/      # FastAPI（secuaigent-server-local/ の移植先。backend/ とは独立した uv プロジェクト）
├── waha-emulator/     # FastAPI（Waha! の servicerun API のエミュレーター。独立した uv プロジェクト）
├── e2e-explorer/      # Playwright（TypeScript）。画面操作を再帰的にたどってバグの疑いを探す E2E 探索ハーネス（#275。移植元にはない独自のもの）
└── infra/             # Terraform（AWS インフラ定義）
```

`e2e-explorer/` は専用の docker compose（プロジェクト名 `naw-e2e-explorer`、別ポート）で PostgreSQL・Redis・backend・frontend を起動して巡回し、終わったら破棄する。既存のローカル環境には触れない。実行方法・担当範囲（画面のまとまり × 権限）の分け方は `e2e-explorer/README.md`、レポートの仕分けは `.claude/skills/e2e-explorer-triage/SKILL.md` を参照すること。

`generative-ai-adapter/` などは、移植に着手するときにルートへ新設する（「プロジェクト概要」の対応表を参照）。

フロントエンド固有の規約は `frontend/.claude/CLAUDE.md`、バックエンド固有は `backend/.claude/CLAUDE.md` を参照すること。

---

## チケット管理

**GitHub Issues + GitHub Projects** を使用する（外部ツールなし）。

- Issue 番号がそのままチケット番号になる（`#1`, `#2`, ...）
- GitHub Projects でステータス管理（起票・進行中・レビュー中・完了）
- PR 説明に `Closes #XX` を書くとマージ時に Issue が自動クローズされる
- Issue 着手時は、原則 `bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}` を使い、`develop` 最新化・ブランチ作成・Issue への linked branch 反映・`In Progress` への移動を自動化する
- PR 作成後は `.github/workflows/project-status-sync.yml` により、対応 Issue を GitHub Projects の `Review` に自動反映する前提で運用する
- PR が `develop` にマージされたら、`Closes #XX` と `.github/workflows/project-status-sync.yml` により GitHub Projects の `Done` まで自動反映される前提で運用する
- Issue 起票の具体的な `gh` コマンド手順・NAW チケット対応の書き方は [.claude/skills/naw-issue-workflow/SKILL.md](.claude/skills/naw-issue-workflow/SKILL.md) を参照すること
- **フロントエンド移植（Angular `secuaigent/client` → React `frontend/`）用のIssue対応harness** は [.claude/skills/naw-frontend-issue-workflow/SKILL.md](.claude/skills/naw-frontend-issue-workflow/SKILL.md)（個別対応）・[naw-frontend-issue-batch](.claude/skills/naw-frontend-issue-batch/SKILL.md)（一括起票）・[naw-frontend-issue-loop](.claude/skills/naw-frontend-issue-loop/SKILL.md)（起票済みIssueの一括処理）として整備済み。バックエンド版（`naw-issue-workflow`/`naw-issue-batch`/`naw-issue-loop`）と対になる構成。フロントエンド移植Issueには必ず `frontend-port` ラベルを付与し、同じプロジェクトボード上でバックエンドIssueと区別する。現在の開発方針（バックエンド優先）に従い、着手前には必ずユーザーに優先順位を確認すること

---

## コミットメッセージのルール

```
#{番号} issue-{番号} 変更概要を1文で
    - 変更詳細
    - 変更詳細
    - ...必要な数
```

NAW チケットに対応する作業の場合は NAW 番号も加える。

```
#{番号} issue-{番号} NAW-XXXX 変更概要を1文で
    - 変更詳細
    - 変更詳細
    - ...必要な数
```

- 1行目: `#{番号}` + 半角スペース + `issue-{番号}` + 半角スペース +（NAW あれば `NAW-XXXX` + 半角スペース）+ 変更概要（日本語1文）
- 2行目以降: 4スペース + `-` + 半角スペース + 変更詳細
- `feat:` / `fix:` などの Conventional Commits プレフィックスは**使わない**
- `Co-Authored-By:` などのトレーラーは**不要**

---

## 作業ブランチ

`main` ブランチ上で直接実装作業を行わない。Issue 対応を開始する際は必ず以下の命名でブランチを作成してから作業すること。

```
# 対応する NAW チケットがある場合
feature/issue-X-NAW-XXXX

# NAW チケットがない場合
feature/issue-X
```

- 新規ブランチは基本的に `develop` から切る
- `develop` はブランチ作成前に必ず最新化する
- `main` からは切らない

### Issue 対応開始時の確認手順

1. 原則 `bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-X` を使って開始する

```bash
bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-X
```

2. 依存する未マージ PR がないかを `gh pr list` で確認する
3. 依存がなければ `develop` から、依存があればその依存ブランチから切る
4. スクリプト未使用時は、ブランチ作成後に対応 Issue への linked branch 反映と GitHub Projects の `In Progress` 移動を手動で行う
5. ユーザーの承認なしに AI がブランチを作成・切り替える
6. ブランチ作成後、要件定義・基本設計（01・02）の作成を開始する

---

## AI仕様駆動開発ドキュメント

実装前に `docs/issue-X/`（NAW チケットあり: `docs/issue-X-NAW-XXXX/`）配下に `00_チケット内容.md`〜`08_動作確認.md` を順番に作成すること。ドキュメントが存在しないまま実装に着手しない。

テンプレート・記載ルール・第1承認（設計承認）／第2承認（実装方式の選択）の承認フロー・Human in the Loop／全自動モードの進め方は [.claude/skills/naw-issue-workflow/SKILL.md](.claude/skills/naw-issue-workflow/SKILL.md) と [.claude/skills/naw-issue-workflow/references/doc-templates.md](.claude/skills/naw-issue-workflow/references/doc-templates.md) を参照すること（`code-review.md` のフォーマットは [naw-pr-workflow](.claude/skills/naw-pr-workflow/SKILL.md) を参照）。

---

## テストコードの命名規則

- テストメソッド名は**英語**で書く
- テストの意図は**日本語 docstring**（`"""`）で書く

```python
async def test_insert_tenant(self, session):
    """テナントをインサートできること"""
    ...
```

---

## 不要コードの削除

変更によって使われなくなったコードは必ず削除すること。呼び出し元・依存先を追って孤立したコードがないかを確認する。

---

## PR作成

ベースブランチの決め方、タイトル・Description のフォーマット、`code-review.md` の記載ルールは [.claude/skills/naw-pr-workflow/SKILL.md](.claude/skills/naw-pr-workflow/SKILL.md) を参照すること。
