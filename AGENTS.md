# naw-server-fastapi-nextjs — Codex 運用ガイド

## 目的

このリポジトリでは、既存運用を `Codex` でも同じ品質で再現する。
詳細な反復手順は `.codex/skills/` へ切り出し、`AGENTS.md` には全体方針と呼び出し条件だけを残す。

Codex の運用ルールは、この `AGENTS.md` と `.codex/skills/` を正とすること。旧設定ファイルは互換運用のため残っていても、Codex の実行時ルールとして参照しない。

## プロジェクト概要

企業向け AI チャット管理 SaaS の移植プロジェクト。

移植元は GitLab のモノレポ `secuaigent`（製品名 SecuAiGent、旧称 NAW）。複数のプロジェクトが入っており、すべて移植対象とする。

| 移植元（`~/Documents/unirita-develop-pj/secuaigent-ref/` 配下） | 移植先 |
|---|---|
| `server/`（Spring Boot 3.5 / Java 21） | FastAPI: `backend/` |
| `client/`（Angular 21） | React（Vite + React Router）: `frontend/` |
| `generative-ai-adapter/`（Java。Waha! 向けの生成AI・埋め込み・検索アダプター） | `generative-ai-adapter/`（Python、新設予定） |
| `secuaigent-server-local/`（Java。オンプレ配布用サーバー） | `server-local/`（Python、新設予定） |
| `secuaigent-infra/`・`e2e-test/`・`ops-scripts/`・`ci-runner/`・`test-reporting/`・`documents/` | 着手時に決める（`secuaigent-infra/` とこのリポジトリの `infra/` の関係も着手時に確認する） |

参照リポジトリは日々更新される。移植作業を始める前に、必ず参照リポジトリの最新状態と `git log` を確認し、どの変更をどう取り込むか判断してから実装すること。

`frontend-angular/`（`secuaigent/client` のコピー。React 移植完了までの backend 動作確認用）は Issue #213 で削除した。backend の動作確認は自動テスト、または React（`frontend/`）の移植済み画面で行う。

### 現在の開発方針

バックエンド（`backend/`）とフロントエンド（`frontend/`、React）を並行して進める。（2026-11-12 改定。それまでは「バックエンド優先・`frontend/` は当面不問」だった）

- `backend/` と `frontend/` の Issue は、どちらも通常どおり起票・対応してよい。`frontend/` の不具合を見つけた場合も起票・修正の対象にする
- 新しく移植対象に加わった `generative-ai-adapter/`・`server-local/`・その他のモジュールは、着手（Issue 起票を含む）前に優先順位をユーザーに確認する
- 新しいチケットに着手する際は、Issue の内容から対象モジュール（`backend/` / `frontend/` / その他）を判断する。判断に迷う場合だけユーザーに確認する
- バックエンドの動作確認は、自動テスト（`uv run pytest`）、または React（`frontend/`、`http://localhost:5173`）の移植済み画面で行う。未移植の画面が必要な確認は自動テストで代替する
- frontend 移植 Issue を起票・着手・自動処理する場合は、`frontend-port` ラベルを使って backend Issue と区別すること

### 参照リポジトリの注意点

- `~/Documents/unirita-develop-pj/secuaigent` はユーザーが業務で使う作業ツリー（作業中のブランチが checkout されている）。ここで `git checkout` / `git pull` をしない
- 参照には参照専用 worktree `~/Documents/unirita-develop-pj/secuaigent-ref`（`origin/develop` に detached）を使う。最新化は `git -C ~/Documents/unirita-develop-pj/secuaigent fetch origin develop && git -C ~/Documents/unirita-develop-pj/secuaigent-ref checkout --detach origin/develop`。worktree がない場合は `git -C ~/Documents/unirita-develop-pj/secuaigent worktree add --detach ../secuaigent-ref origin/develop` で作る
- `secuaigent-ref` は読むだけにする。ファイルの変更・コミット・push・MR 作成はしない（GitLab の `secuaigent` に Issue・MR を作らない）
- `server/` は最初から git 管理されており、`git log` で全履歴を追える
- `client/` は 2026-07-13 にモノレポへ取り込まれたため、それ以前は履歴だけでは追いきれない箇所がある。必要に応じて最新コードも直接読むこと

### テナント識別方式（サブドメイン廃止・移植/調査時の前提条件）

**このプロジェクトはテナント識別にサブドメイン（`window.location.hostname` 等）を使わない。** Issue #193（当時の Angular 版フロント。#213 で削除）・#195（infra）で、サブドメインを前提とした実装を意図的に廃止した。

| 対象 | 廃止内容 | 現在の方式 |
|---|---|---|
| frontend（React） | hostname パースは持たない（#193 で Angular 版から撤去した `resolveTenantId()` の hostname パース・`extractTenantIdFromHostname()` 相当は移植しない） | **方針**: ログイン画面でテナントIDを明示入力 → `sessionStorage` 保存 → `X-Tenant-ID` ヘッダ送信（#193 で Angular 版に入れた方式。React にも同じ方式が必要）。**現状（#213 時点）**: ログイン画面にテナントID入力欄がなく、`X-Tenant-ID` はログイン後に `GET /api/auth` で得た `tenant_id` を `sessionStorage` に保存してから送る。backend の `POST /auth/login` は `X-Tenant-ID` 必須のため、入力欄を移植するまで React からはログインできない |
| infra（Issue #195） | Route53ホストゾーン、ACM証明書（ワイルドカードSAN）、CloudFrontエイリアス、ワイルドカードCORS正規表現 | CloudFrontデフォルトドメイン（`*.cloudfront.net`）配信、固定オリジンのCORS |

**参照リポジトリ（`secuaigent/client` / `secuaigent/server`）はサブドメインを廃止していない。** サブドメイン廃止はこのリポジトリ側だけの意図的な決定であり、参照リポジトリの実装が古い／未移植なわけではない。実際、`secuaigent/client` の `tenant.helpers.ts` は今も hostname フォールバックを持つ（このリポジトリでは #193 で当時の Angular 版から撤去し、Angular 版自体も #213 で削除した。React 側にも持ち込まない）。

- **未移植判定からの除外（最重要）**: Issue 一括起票系 skill（`naw-issue-batch` / `naw-frontend-issue-batch`）で参照リポジトリとの差分を検出する際、サブドメイン（hostname）ベースのテナント識別・ワイルドカードDNS/証明書前提の設計は「未移植の欠落」として検出・Issue化しない。意図的に廃止したものであり、差分として存在すること自体が正しい状態
- 逆に、参照リポジトリの調査・読解自体（挙動理解、無関係な機能のリサーチ等）では通常どおりサブドメイン前提のコードも含めてそのまま読む。除外するのは「未移植候補としての検出」の場面に限る
- 実際に移植作業でサブドメイン依存のロジックに行き当たった場合は、そのまま持ち込まず実装前に一言確認する

## モノレポ構成

```text
naw-server-fastapi-nextjs/
├── frontend/          # React 実装（移植先）
├── backend/           # FastAPI 実装
└── infra/             # Terraform（存在する場合）
```

- 全体方針はこの `AGENTS.md`
- フロントエンド固有ルールは `frontend/AGENTS.md`
- バックエンド固有ルールは `backend/AGENTS.md`

## Skills / Commands

この `AGENTS.md` を読んだ Codex は、以下の条件に一致したら対応する skill を必ず先に読むこと。

### 1. Issue / 設計 / HITL / 全自動

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-issue-workflow/SKILL.md` を読むこと。

- Issue 対応開始
- `docs/issue-*` 作成
- 要件定義、基本設計、詳細設計、テスト設計
- Human in the Loop
- 全自動実装

さらに、`docs/issue-*` の雛形が未作成なら、必要に応じて次の command を実行してから作業を続けること。

```bash
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-X
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-X-NAW-XXXX
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-X
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-X-NAW-XXXX
```

### 2. frontend 移植 Issue / 設計 / HITL / 全自動

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-frontend-issue-workflow/SKILL.md` を読むこと。

- frontend 移植 Issue 対応開始
- frontend 向け `docs/issue-*` 作成
- Angular `secuaigent/client` → React `frontend/` の要件定義、基本設計、詳細設計、テスト設計
- frontend 移植 Issue の Human in the Loop
- frontend 移植 Issue の全自動実装

この skill は backend 用 `naw-issue-workflow` と対になる frontend 専用フローである。`frontend-port` ラベル運用、frontend 向け動作確認、`frontend/AGENTS.md` を前提にした移植方針をここで扱う。

### 3. Issue 一括起票

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-issue-batch/SKILL.md` を読むこと。

- `/naw-issue-batch`
- 未移植のバックエンド機能をまとめて Issue 起票する
- `~/Documents/unirita-develop-pj/secuaigent-ref/server` から未移植候補を検出し、Issue 作成だけを繰り返す

この skill は Issue 起票のみを行う。ブランチ作成、`docs/issue-*` 作成、実装、PR 作成には進まない。

### 4. frontend 移植 Issue 一括起票

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-frontend-issue-batch/SKILL.md` を読むこと。

- `/naw-frontend-issue-batch`
- 未移植の frontend 機能をまとめて Issue 起票する
- `~/Documents/unirita-develop-pj/secuaigent-ref/client` から未移植候補を検出し、frontend 向け Issue 作成だけを繰り返す

この skill は frontend 移植 Issue の起票のみを行う。ブランチ作成、`docs/issue-*` 作成、実装、PR 作成には進まない。起票時は `frontend-port` ラベルを必ず付与する。

### 5. Todo Issue 自動処理ループ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-issue-loop/SKILL.md` を読むこと。

- `/naw-issue-loop`
- GitHub Projects の `Todo` Issue を1件ずつ、着手からPR作成まで進める
- 「open backend porting Issues を順番に最後まで進めて」等、起票済みIssueの自動処理ループを明示されたとき

この skill は `naw-issue-workflow` と `naw-pr-workflow` を組み合わせ、承認フローを省略して全自動モードで進める専用フローである。単一Issueを対話的に進める場合は使わず、`naw-issue-workflow` を使う。

### 6. frontend 移植 Todo Issue 自動処理ループ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-frontend-issue-loop/SKILL.md` を読むこと。

- `/naw-frontend-issue-loop`
- GitHub Projects の `frontend-port` ラベル付き `Todo` Issue を1件ずつ、着手からPR作成まで進める
- 「open frontend porting Issues を順番に最後まで進めて」等、frontend 移植 Issue の自動処理ループを明示されたとき

この skill は `naw-frontend-issue-workflow` と `naw-pr-workflow` を組み合わせ、frontend 移植 Issue を全自動で進める専用フローである。対象は `frontend-port` ラベル付き Issue のみとする。

### 7. frontend 移植の伴走支援

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-frontend-mentor/SKILL.md` を読むこと。

- `/naw-frontend-mentor`
- frontend 移植 Issue をユーザー自身が実装したいので、教えながら進めてほしいとき
- React 初学者向けに Angular → React の対応を説明しながら伴走するとき

この skill では、AI は実装主体ではなく講師・レビュアーとして振る舞う。通常の `naw-frontend-issue-workflow` と混同しないこと。

### 8. PR / レビュー / 動作確認まとめ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-pr-workflow/SKILL.md` を読むこと。

- PR 作成
- PR 本文更新
- `code-review.md` 作成
- テスト結果・動作確認結果の整理

Codex では、**PR 作成依頼は `gh pr create` で終わりではなく、必ず同じ作業フローの中でコードレビュー実行と `code-review.md` 作成まで完了させること**。Codex は自分で差分レビューを実行し、結果をドキュメントへ反映すること。

## 実行方針

skill を読まずに進めてよいのは、単純な質問応答や軽微な確認だけとする。
Issue 対応や PR 対応では、該当 skill を読んだ前提で進めること。

判断が分かれる点だけ確認し、それ以外は止まらず進める。
ただし Issue 対応では、この `AGENTS.md` と `.codex/skills/naw-issue-workflow/SKILL.md` に定義された承認フローを優先し、指定された承認ポイントでは必ず停止すること。

### Issue 対応時の承認フロー

- 第1承認: `01_要件定義.md` と `02_基本設計.md` の作成完了後に必ず停止し、承認を得る
- 第2承認: `03_詳細設計.md` 〜 `07_gitコミット.md` の作成完了後に必ず停止し、`Human in the Loop` または `全自動` の実装方式を確認する
- 上記承認を得る前に、実装コードの変更・生成へ進まない
- `Human in the Loop` が選択された場合は、各タスク実行前に承認を得る
- `全自動` が選択された場合のみ、実装フェーズ以降を止まらず進めてよい

## GitHub 運用

- チケット管理は GitHub Issues + GitHub Projects
- プロジェクト番号は `3`
- オーナーは `ryoya-masuda-unirita`
- Issue 着手時は、原則 `bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-X` を使い、`develop` 最新化・ブランチ作成・Issue への linked branch 反映・`In Progress` への移動を自動化する
- PR 本文には必ず `Closes #XX` を含める
- PR 作成後は `.github/workflows/project-status-sync.yml` により GitHub Projects の `Review` へ自動反映する前提で運用する
- PR が `develop` へマージされたら、`Closes #XX` により Issue が自動クローズされ、GitHub Projects でも `Done` へ自動反映する前提で運用する
- ブランチは `feature/issue-X` または `feature/issue-X-NAW-XXXX`
- `main` から直接作業しない

## コミットメッセージ規約

Conventional Commits は使わず、Issue 番号ベースの日本語メッセージに統一する。

```text
#{番号} issue-{番号} 変更概要を1文で
    - 変更詳細
    - 変更詳細
```

NAW チケットに対応する作業の場合は NAW 番号も加える。

```text
#{番号} issue-{番号} NAW-XXXX 変更概要を1文で
    - 変更詳細
    - 変更詳細
```

- 1行目: `#{番号}` + 半角スペース + `issue-{番号}` + 半角スペース +（NAW あれば `NAW-XXXX` + 半角スペース）+ 変更概要（日本語1文）
- 2行目以降: 4スペース + `-` + 半角スペース + 変更詳細
- `feat:` / `fix:` などの Conventional Commits プレフィックスは使わない
- `Co-Authored-By:` などのトレーラーは不要

## クラウド / 環境メモ

- 環境: dev/staging のみ（本番環境なし）
- フロントエンド: CloudFront + S3
- バックエンド: AWS ECS（EC2 起動タイプ、t4g.nano。メモリ不足時は t4g.micro に変更）
- DB: Amazon RDS PostgreSQL（db.t4g.micro）
- コンテナレジストリ: Amazon ECR
- IaC: Terraform
- CI/CD: GitHub Actions + OIDC
- リージョン: ap-northeast-1

RDS はコスト削減のためデフォルト停止運用。必要時のみ起動し、作業後は停止すること。
手動停止した RDS は AWS の制約で7日後に自動再起動されるため、EventBridge Scheduler で毎日 09:00 JST に起動、09:10 JST に停止する10分間スケジュールを設定し、7日連続停止を避ける。

## 実務上の注意

- 既存の `docs/issue-*` は実例として参照してよい
- 参照実装の仕様差分は必ず記録する
- 実装前に影響範囲を文章で整理し、実装後はテスト結果へ反映する
- ユーザーが「ちゃんとやって」と求めている前提で、調査・設計・実装・検証を省略しない
