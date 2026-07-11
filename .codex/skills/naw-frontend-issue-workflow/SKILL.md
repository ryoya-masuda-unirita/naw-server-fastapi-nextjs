---
name: naw-frontend-issue-workflow
description: Use when working on a frontend porting GitHub Issue (Angular secuaigent-client → React frontend/) in this repository, including issue start, branch selection, docs/issue-* generation, HITL checkpoints, or full-auto implementation flow for naw-server-fastapi-nextjs.
---

# NAW Frontend Issue Workflow

この skill は、このリポジトリで frontend 移植（Angular `secuaigent-client` → React `frontend/`）の Issue 対応を進めるときに使う。

backend（Spring Boot `naw-server` → FastAPI `backend/`）の Issue 対応は [naw-issue-workflow](../naw-issue-workflow/SKILL.md) を使う。ブランチ命名、ドキュメント構成、承認フロー、コミット規約は共通であり、本 skill では frontend 固有の差分だけを上書きする。

## 使う場面

- 新しい frontend 移植 Issue に着手する
- `docs/issue-*` 一式を作る
- HITL で段階承認しながら進める
- 全自動で設計から実装まで進める

## naw-issue-workflow との違い

| 項目 | naw-issue-workflow（backend） | naw-frontend-issue-workflow（本 skill） |
|---|---|---|
| 移植元 | `~/Documents/naw-server` | `~/Documents/secuaigent-client` |
| 移植先 | `backend/` | `frontend/` |
| Issue ラベル | なし | 必ず `frontend-port` を付与する |
| 自動テスト | `pytest` | `npm run test`, `npm run lint`, `npm run type-check` |
| 動作確認 | `frontend-angular/` を使った backend 確認 | `frontend/` の画面確認 |
| 実装ガイド | backend/AGENTS 中心 | `frontend/AGENTS.md` を必ず参照 |

それ以外（ブランチ命名規則、ドキュメント構成、承認フロー、コミット規約、PR フォーマット）は `naw-issue-workflow` と共通。

## 最初の流れ

1. 参照リポジトリ（`secuaigent-client`）を確認する
2. `gh pr list` で依存 PR の有無を確認する
3. `develop` を最新化する
4. 適切なブランチを切る
5. 作成したブランチを対応 Issue に紐づける
6. Issue を GitHub Projects の `In Progress` に移動する
7. `docs/issue-*` を作成する

この 3〜6 は、[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じスクリプトで自動化する。

### 参照リポジトリ調査

`secuaigent-client` の最新画面、コンポーネント実装、翻訳ファイル、`styles.css`、対応する React 実装の有無、依存する backend API の実装状況は、Codex が直接確認する。

- 調査は読み取り専用で行い、`gh issue create` 等の書き込み操作は候補・仕様を整理した後に行う
- 対象画面・コンポーネントの仕様、参照元ファイルパス、React 側の対応実装有無、依存する backend API の状況を整理する
- `frontend/AGENTS.md` の Angular → React 対応表とデザイン移行方針を前提に設計する
- 対象が広すぎる場合だけ、作業前にユーザーへ確認する

## Issue 起票手順

Issue 起票は必ず以下の手順を順番に行う（backend 用と同じだが、`frontend-port` ラベル付与が必須）。

```bash
# Step 1: Issue 作成（frontend-port ラベル必須）
gh issue create --title "issue-{仮} 変更概要" --label "frontend-port" --body "..."
# → URL から番号を取得する

# Step 1.5: 確定した番号でタイトルを付け直す
gh issue edit {番号} --title "#{番号} issue-{番号} 変更概要"

# Step 2: Projects に追加
gh project item-add 3 --owner ryoya-masuda-unirita \
  --url https://github.com/ryoya-masuda-unirita/naw-server-fastapi-nextjs/issues/{番号}

# Step 2.5: Projects 追加確認
gh issue view {番号} --json projectItems --jq '.projectItems | length'

# Step 3: Issue 開始スクリプト
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}

# Step 4: docs 雛形生成
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-{番号}
```

- プロジェクト番号: `3`
- オーナー: `ryoya-masuda-unirita`
- `frontend-port` ラベルの付与を省略しないこと
- 対応する NAW チケットがある場合だけ `issue-{番号}-NAW-XXXX` 形式を使ってよい

### Issue 本文のフォーマット

```markdown
## 概要
〇〇画面（Angular）を React に移植する。

## 参照
- 移植元（frontend）: `~/Documents/secuaigent-client/src/app/...`
- 移植先: `frontend/src/...`
- 依存する backend API: `GET /api/...`（実装状況も明記）
```

## ブランチ規約

```text
feature/issue-X
feature/issue-X-NAW-XXXX
```

- `main` から直接切らない
- 必ず最新化した `develop` または依存ブランチから切る
- ブランチ作成後は対応 Issue の linked branch として紐づける

## ドキュメント作成

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ構成・同じテンプレートを使う。

- `00_チケット内容.md`
- `01_要件定義.md`
- `02_基本設計.md`
- `03_詳細設計.md`
- `04_テスト設計.md`
- `05_テスト詳細設計.md`
- `06_タスクリスト.md`
- `07_gitコミット.md`
- `08_動作確認.md`

テンプレートと記載ルールは [naw-issue-workflow/references/doc-templates.md](../naw-issue-workflow/references/doc-templates.md) を読むこと。frontend 固有の追記として、以下を含める。

- `02_基本設計.md` の移植方針には `frontend/AGENTS.md` の Angular → React 対応表に沿った変換方針を書く
- `03_詳細設計.md` には参照する Angular テンプレート、移行先の React コンポーネント、必要な CSS / i18n 資産を具体化する
- `04_テスト設計.md` は Vitest + React Testing Library を前提にする

## 承認フロー

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ2段階承認に従う。

### 第1承認: 設計承認

- `01_要件定義.md` と `02_基本設計.md` を作成する
- 完了後は必ず停止し、ユーザー承認を得る
- 承認前に `03_詳細設計.md` 以降へ進まない

### 第2承認: 実装方式の選択

- 第1承認後に `03_詳細設計.md` 〜 `07_gitコミット.md` を作成する
- 完了後は必ず停止し、`Human in the Loop` または `全自動` のどちらで進めるかを確認する
- 選択を得る前に、実装コードの変更・生成へ進まない

### Human in the Loop

各チェックリスト項目を実行する前に必ずユーザーの承認を得ること。

```text
【次のタスク】
- 何をやるか: （具体的な変更内容）
- なぜやるか: （目的・理由）
- 期待結果: （実行後に何が変わるか）

進めてよいですか？
```

- 承認後に実行し、完了後に `06_タスクリスト.md` の該当項目を即時 `- [x]` にチェックする
- コミット・プッシュはユーザー承認後に行う

### 全自動

第2承認で `全自動` が選択された場合のみ、実装フェーズ以降を一気通しで進める。

1. 実装
2. 自動テスト（`npm run test`, `npm run lint`, `npm run type-check`）
3. 動作確認（可能なら `npm run dev` による確認。難しければ未確認事項として `08_動作確認.md` に明記）
4. PR 作成
5. コードレビュー実行
6. `code-review.md` 作成
7. 必要な修正、再テスト、PR 更新

code-review 指摘への対応: 🔴 致命的は必ず修正、🟡 注意・🔵 提案は AI が判断する。

## Command 的に使う補助スクリプト

backend 用と同じスクリプトを流用する。

```bash
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-12
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12
```

## PR / Projects 自動反映

- PR 作成後は `.github/workflows/project-status-sync.yml` により、`Closes #XX` を含む PR の対応 Issue を `Review` へ自動更新する
- PR が merge されたら、同 workflow により対応 Issue を `Done` へ自動更新する
- PR 本文には必ず `Closes #XX` を入れる

## コミット規約

[naw-issue-workflow](../naw-issue-workflow/SKILL.md) と同じ。Conventional Commits は使わない。
