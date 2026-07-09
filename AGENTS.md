# naw-server-fastapi-nextjs — Codex 運用ガイド

## 目的

このリポジトリでは、既存運用を `Codex` でも同じ品質で再現する。
詳細な反復手順は `.codex/skills/` へ切り出し、`AGENTS.md` には全体方針と呼び出し条件だけを残す。

Codex の運用ルールは、この `AGENTS.md` と `.codex/skills/` を正とすること。旧設定ファイルは互換運用のため残っていても、Codex の実行時ルールとして参照しない。

## プロジェクト概要

企業向け AI チャット管理 SaaS の移植プロジェクト。

| 移植元 | 移植先 |
|---|---|
| Angular: `~/Documents/secuaigent-client` | React（Vite + React Router）: `frontend/` |
| Spring Boot: `~/Documents/naw-server` | FastAPI: `backend/` |

参照リポジトリは日々更新される。移植作業を始める前に、必ず参照リポジトリの最新状態と `git log` を確認し、どの変更をどう取り込むか判断してから実装すること。

`frontend-angular/` は `secuaigent-client`（Angular）をそのままモノレポに取り込んだもの。React 移植（`frontend/`）が完了するまでの間、バックエンド（`backend/`）の動作確認用フロントエンドとして使う。開発サーバーは `http://localhost:4201`。
`secuaigent-client` / `frontend-angular` が明示された同期依頼、または「frontendを最新にして」など文脈上 `secuaigent-client` → `frontend-angular` 同期と判断できる依頼では、`.codex/skills/frontend-angular-sync/SKILL.md` を先に読むこと。`frontend/`（React）と `frontend-angular/` のどちらを指すか判断に迷う場合のみ、作業前にユーザーへ確認すること。

### 現在の開発方針

しばらくはバックエンド（`backend/`）優先で開発を進める。

- Issue 起票・実装対応は `backend/` を優先し、`frontend/`（React 移植）は後回しにする
- バックエンドの動作確認（ブラウザ操作）には `frontend/` ではなく `frontend-angular/`（`http://localhost:4201`）を使う
- `frontend/`（React）は当面不問とする。動作確認・code review 等で `frontend/` 側の不具合を発見しても、その場で新規 Issue を起票したり修正したりしない。気づいた点があれば会話内で一言触れる程度に留め、対応要否の判断はユーザーに委ねる
- フロントエンド側の対応が必要な Issue が来た場合は、優先順位についてユーザーに確認すること
- 新しいチケットに着手する際は、作業を始める前に必ず「今回もバックエンド（FastAPI実装）でいいですか？」とユーザーに確認すること

### 参照リポジトリの注意点

- `~/Documents/naw-server` は最初から git 管理されており、`develop` ブランチがある
- `~/Documents/secuaigent-client` は途中から git 管理のため、履歴だけでは追いきれない箇所がある。必要に応じて最新コードも直接読むこと

## モノレポ構成

```text
naw-server-fastapi-nextjs/
├── frontend/          # React 実装（移植先）
├── frontend-angular/  # Angular 実装（secuaigent-client を取り込んだもの。バックエンド動作確認用）
├── backend/           # FastAPI 実装
└── infra/             # Terraform（存在する場合）
```

- 全体方針はこの `AGENTS.md`
- フロントエンド固有ルールは `frontend/AGENTS.md`
- Angular（動作確認用）固有ルールは `frontend-angular/AGENTS.md`
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

### 2. Issue 一括起票

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-issue-batch/SKILL.md` を読むこと。

- `/naw-issue-batch`
- 未移植のバックエンド機能をまとめて Issue 起票する
- `~/Documents/naw-server` から未移植候補を検出し、Issue 作成だけを繰り返す

この skill は Issue 起票のみを行う。ブランチ作成、`docs/issue-*` 作成、実装、PR 作成には進まない。

### 3. Todo Issue 自動処理ループ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-issue-loop/SKILL.md` を読むこと。

- `/naw-issue-loop`
- GitHub Projects の `Todo` Issue を1件ずつ、着手からPR作成まで進める
- 「open backend porting Issues を順番に最後まで進めて」等、起票済みIssueの自動処理ループを明示されたとき

この skill は `naw-issue-workflow` と `naw-pr-workflow` を組み合わせ、承認フローを省略して全自動モードで進める専用フローである。単一Issueを対話的に進める場合は使わず、`naw-issue-workflow` を使う。

### 4. PR / レビュー / 動作確認まとめ

以下の依頼に着手するときは、作業前に必ず `.codex/skills/naw-pr-workflow/SKILL.md` を読むこと。

- PR 作成
- PR 本文更新
- `code-review.md` 作成
- テスト結果・動作確認結果の整理

Codex では、**PR 作成依頼は `gh pr create` で終わりではなく、必ず同じ作業フローの中でコードレビュー実行と `code-review.md` 作成まで完了させること**。Codex は自分で差分レビューを実行し、結果をドキュメントへ反映すること。

### 5. secuaigent-client → frontend-angular 同期

以下の依頼に着手するときは、作業前に必ず `.codex/skills/frontend-angular-sync/SKILL.md` を読むこと。

- `secuaigent-client` の最新実装を `frontend-angular/` に反映したいとき
- `frontend-angular/` を最新にしたいとき
- `secuaigent-client` から `frontend-angular/` にソースをコピーしたいとき
- 「frontendを最新にして」「frontend-angularを最新にして」「secuaigent-clientから持ってきて」等、文言が曖昧でも文脈上 `secuaigent-client` → `frontend-angular` 同期の意図だと判断できるとき

`secuaigent-client` または `frontend-angular` が明示されていれば確認不要。`frontend/`（React 移植）と `frontend-angular/` のどちらを指すか判断に迷う場合のみ、ユーザーに確認すること。

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
