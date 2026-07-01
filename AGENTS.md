# naw-server-fastapi-nextjs — Codex 運用ガイド

## 目的

このリポジトリでは、既存の `.claude/CLAUDE.md` 運用を `Codex` でも同じ品質で再現する。
詳細な反復手順は `.codex/skills/` へ切り出し、`AGENTS.md` には全体方針と呼び出し条件だけを残す。

既存の `.claude/CLAUDE.md` は互換運用のため残してよいが、Codex はこの `AGENTS.md` を優先して従うこと。

## プロジェクト概要

企業向け AI チャット管理 SaaS の移植プロジェクト。

| 移植元 | 移植先 |
|---|---|
| Angular: `~/Documents/secuaigent-client` | React（Vite + React Router）: `frontend/` |
| Spring Boot: `~/Documents/naw-server` | FastAPI: `backend/` |

参照リポジトリは日々更新される。移植作業を始める前に、必ず参照リポジトリの最新状態と `git log` を確認し、どの変更をどう取り込むか判断してから実装すること。

### 参照リポジトリの注意点

- `~/Documents/naw-server` は最初から git 管理されており、`develop` ブランチがある
- `~/Documents/secuaigent-client` は途中から git 管理のため、履歴だけでは追いきれない箇所がある。必要に応じて最新コードも直接読むこと

## モノレポ構成

```text
naw-server-fastapi-nextjs/
├── frontend/    # React 実装
├── backend/     # FastAPI 実装
└── infra/       # Terraform（存在する場合）
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
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-X
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-X-NAW-XXXX
```

### 2. PR / レビュー / 動作確認まとめ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-pr-workflow/SKILL.md` を読むこと。

- PR 作成
- PR 本文更新
- `code-review.md` 作成
- テスト結果・動作確認結果の整理

## 実行方針

skill を読まずに進めてよいのは、単純な質問応答や軽微な確認だけとする。
Issue 対応や PR 対応では、該当 skill を読んだ前提で進めること。

判断が分かれる点だけ確認し、それ以外は止まらず進める。

## GitHub 運用

- チケット管理は GitHub Issues + GitHub Projects
- プロジェクト番号は `3`
- オーナーは `ryoya-masuda-unirita`
- Issue 着手時は、必ず `develop` を最新化してから作業ブランチを切る
- 作業ブランチは対応 Issue と紐づけること
- 作業ブランチを切って着手したら、対象 Issue を GitHub Projects の `In Progress` へ移動する
- PR 本文には必ず `Closes #XX` を含める
- PR が `develop` へマージされたら、`Closes #XX` により Issue が自動クローズされ、GitHub Projects でも `Done` へ自動反映される前提で運用する
- ブランチは `feature/issue-X` または `feature/issue-X-NAW-XXXX`
- `main` から直接作業しない

## コミットメッセージ規約

Conventional Commits は使わず、Issue 番号ベースの日本語メッセージに統一する。具体例と分割方針は `naw-issue-workflow` 側の指示に従うこと。

## クラウド / 環境メモ

- フロントエンド: CloudFront + S3
- バックエンド: AWS ECS（EC2 起動タイプ）
- DB: Amazon RDS PostgreSQL
- コンテナレジストリ: Amazon ECR
- IaC: Terraform
- CI/CD: GitHub Actions + OIDC
- リージョン: ap-northeast-1

RDS はコスト削減のためデフォルト停止運用。必要時のみ起動し、作業後は停止すること。

## 実務上の注意

- 既存の `docs/issue-*` は実例として参照してよい
- 参照実装の仕様差分は必ず記録する
- 実装前に影響範囲を文章で整理し、実装後はテスト結果へ反映する
- ユーザーが「ちゃんとやって」と求めている前提で、調査・設計・実装・検証を省略しない
