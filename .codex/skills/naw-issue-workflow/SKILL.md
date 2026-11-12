---
name: naw-issue-workflow
description: Use when working on a GitHub Issue in this repository, including issue start, branch selection, docs/issue-* generation, HITL checkpoints, or full-auto implementation flow for naw-server-fastapi-nextjs.
---

# NAW Issue Workflow

この skill は、このリポジトリの Issue 対応を進めるときに使う。

## 使う場面

- 新しい Issue に着手する
- `docs/issue-*` 一式を作る
- HITL で段階承認しながら進める
- 全自動で設計から実装まで進める

## 最初の流れ

1. 参照リポジトリを確認する
2. `gh pr list` で依存 PR の有無を確認する
3. `develop` を最新化する
4. 適切なブランチを切る
5. 作成したブランチを対応 Issue に紐づける
6. Issue を GitHub Projects の `In Progress` に移動する
7. `docs/issue-*` を作成する

この 3〜6 は、原則として `start_issue.sh` を使って自動化する。

移植元:

- バックエンド: `~/Documents/secuaigent/server`
- フロントエンド: `~/Documents/secuaigent/client`

### 参照リポジトリ調査

「1. 参照リポジトリを確認する」（移植元の `git log` 確認、対象 Controller/Service/Request/Response の読み込み、既存 Issue との突き合わせ等）は、Codex が実装前に必要な範囲を直接確認する。外部AI固有の agent や memory を参照せず、この skill とローカルの参照リポジトリだけで完結させる。

- 調査は読み取り専用で行い、`gh issue create` 等の書き込み操作は候補・仕様を整理した後にメイン手順として実行する
- 対象の移植元ファイルパス（分かっていれば）、確認したい範囲（例: `RoomController` の未移植エンドポイント）、対象エンドポイントの仕様、参照元ファイルパス、既存実装との差分を整理する
- バックエンド調査では `~/Documents/secuaigent/server` と `backend/app/routers/`・`backend/app/services/`・`backend/app/schemas/` を突き合わせる
- フロントエンド調査を依頼された場合のみ `~/Documents/secuaigent/client` と `frontend/` を突き合わせる。通常はバックエンド優先とする
- 対象が広すぎて判断が分かれる場合だけ、作業前にユーザーへ確認する

## Issue 起票手順

Issue 起票は必ず以下の手順を順番に行う。

```bash
# Step 1: Issue 作成（番号未確定のため、この時点では "#{番号}" を付けずに作成する）
gh issue create --title "issue-{仮} NAW-XXXX 変更概要" --body "..."
# → 返ってきた URL から番号を取得する（例: .../issues/65 → 65）

# Step 1.5: 確定した番号でタイトルを付け直す（ここを忘れると "#{番号}" が欠けたまま残る）
gh issue edit {番号} --title "#{番号} issue-{番号} NAW-XXXX 変更概要"

# Step 2: プロジェクトボードに追加（Todo 状態で登録される）
gh project item-add 3 --owner ryoya-masuda-unirita \
  --url https://github.com/ryoya-masuda-unirita/naw-server-fastapi-nextjs/issues/{番号}

# Step 2.5: プロジェクトボードに追加できたか確認する（失敗を静かに見過ごさない）
gh issue view {番号} --json projectItems --jq '.projectItems | length'
# 0 の場合は Step 2 が失敗しているので、原因を確認してから再実行する

# Step 3: Issue 開始スクリプトで最新化・ブランチ作成・linked branch 反映・In Progress 移動まで自動化
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}           # NAW なし
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}-NAW-XXXX  # NAW あり

# Step 4: docs ディレクトリと 00_チケット内容.md を作成してコミット
mkdir -p docs/issue-{番号}           # NAW なし
mkdir -p docs/issue-{番号}-NAW-XXXX  # NAW あり
# 00_チケット内容.md を作成（テンプレート参照）
git add docs/ && git commit -m "#{番号} issue-{番号} 00_チケット内容.md を作成"
git push -u origin feature/issue-{番号}
```

- プロジェクト番号: `3`
- オーナー: `ryoya-masuda-unirita`
- **Step 1 で作成した時点のタイトルには Issue 番号がまだ入らない。Step 1.5 でのタイトル付け直しと Step 2.5 でのプロジェクト追加確認を省略しないこと**（過去に #65 でこの2点が漏れ、ユーザーが手動修正する事態が発生した）

### NAW チケットとの対応

GitHub Issue の番号と NAW チケット番号（`NAW-XXXX`）は一致しない。移植元の NAW チケットがある場合は Issue 本文に参照として記載する。

```markdown
## 概要
NAW-XXXX の移植。〇〇機能を FastAPI / React で実装する。

## 参照
- 元チケット: NAW-XXXX
- 移植元（バックエンド）: `~/Documents/secuaigent/server/src/...`
- 移植元（フロントエンド）: `~/Documents/secuaigent/client/src/...`
```

## ブランチ規約

```text
feature/issue-X
feature/issue-X-NAW-XXXX
```

- `main` から直接切らない
- 必ず最新化した `develop` または依存ブランチから切る
- 依存 PR がある場合は、その依存ブランチから切る
- ブランチ作成後は対応 Issue の Development / linked branch として紐づける

## ドキュメント作成

必要ファイル:

- `00_チケット内容.md`
- `01_要件定義.md`
- `02_基本設計.md`
- `03_詳細設計.md`
- `04_テスト設計.md`
- `05_テスト詳細設計.md`
- `06_タスクリスト.md`
- `07_gitコミット.md`
- `08_動作確認.md`

テンプレートと記載ルールは [references/doc-templates.md](references/doc-templates.md) を読むこと。

## 承認フロー

Issue 対応は、デフォルトで以下の承認フローに従う。

### 第1承認: 設計承認

- `01_要件定義.md` と `02_基本設計.md` を作成する
- 不明点があればここで解消する
- 完了後は必ず停止し、ユーザー承認を得る
- 承認前に `03_詳細設計.md` 以降へ進まない

### 第2承認: 実装方式の選択

- 第1承認後に `03_詳細設計.md` 〜 `07_gitコミット.md` を作成する
- 必要に応じてドキュメントをコミット・プッシュする
- 完了後は必ず停止し、`Human in the Loop` または `全自動` のどちらで進めるかを確認する
- 選択を得る前に、実装コードの変更・生成へ進まない

### Human in the Loop

各チェックリスト項目を実行する前に必ずユーザーの承認を得ること。

```
【次のタスク】
- 何をやるか: （具体的な変更内容）
- なぜやるか: （目的・理由）
- 期待結果: （実行後に何が変わるか）

進めてよいですか？
```

- 承認後に実行し、完了後に `06_タスクリスト.md` の該当項目を即時 `- [x]` にチェックする（まとめてチェックするのは禁止）
- **コミット・プッシュはどちらもユーザーの承認を得た後にのみ行う。**

### 全自動

第2承認で `全自動` が選択された場合のみ、実装フェーズ（コードの変更・生成）以降を、ユーザーに一度も操作させずに以下のサイクルで完遂する。

1. 実装（`06_タスクリスト.md` のタスクを順番に実行）
2. テスト実行
3. 動作確認（サーバー起動手順をユーザーに案内し、操作結果を受け取る）
4. PR 作成
5. ベースブランチ差分でのコードレビュー実行
6. `code-review.md` の作成（[naw-pr-workflow](../naw-pr-workflow/SKILL.md) のフォーマットに従う）
7. 指摘修正 → 再テスト → 再動作確認 → PR 修正

PR 作成後は `prepare_code_review.sh` でレビュー対象を確定し、Codex 自身が差分レビューを実行して `code-review.md` を更新すること。

code-review 指摘への対応: 🔴 致命的は必ず修正、🟡 注意・🔵 提案は AI が判断する。

## Command 的に使う補助スクリプト

Issue 開始時は次を優先して使う。

```bash
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-12
bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-12-NAW-1234
```

このスクリプトは以下を行う。

- `develop` を最新化する
- `feature/issue-*` ブランチを作成して checkout する
- GitHub Issue に linked branch を反映する
- GitHub Projects のステータスを `In Progress` に更新する

`docs/issue-*` の雛形だけ先に作るときは次を使う。

```bash
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12
```

NAW チケット付き:

```bash
bash .codex/skills/naw-issue-workflow/scripts/scaffold_issue_docs.sh issue-12-NAW-1234
```

このスクリプトは以下を行う。

- `docs/<issue-name>/` を作成
- `00`〜`08` の markdown ファイルを作成
- `00_チケット内容.md` と `06_タスクリスト.md` に最低限の雛形を入れる

## PR / Projects 自動反映

- PR 作成後は `.github/workflows/project-status-sync.yml` により、`Closes #XX` を含む PR の対応 Issue を `Review` へ自動更新する
- PR が merge されたら、同 workflow により対応 Issue を `Done` へ自動更新する
- Codex は PR 本文に必ず `Closes #XX` を入れ、自動反映の前提を満たすこと

## コミット規約

Conventional Commits は使わない。

```text
#11 issue-11 変更概要
    - 変更詳細
```

NAW あり:

```text
#11 issue-11 NAW-1234 変更概要
    - 変更詳細
```
