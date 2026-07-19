---
name: naw-frontend-issue-loop
description: Use ONLY when the user explicitly invokes /naw-frontend-issue-loop or explicitly asks to work through open frontend porting Issues (Angular secuaigent/client → React frontend/) one by one end-to-end (branch → docs → implementation → tests → PR) for naw-server-fastapi-nextjs. Repeatedly picks the lowest-numbered GitHub Projects Todo issue labeled frontend-port, runs naw-frontend-issue-workflow in full-auto mode, then naw-pr-workflow to open a PR with code-review.md.
---

# NAW Frontend Issue Loop

GitHub Projects の `Todo` 状態にある `frontend-port` ラベル付き Issue を1件ずつ、着手から PR 作成まで自動処理する skill。`naw-frontend-issue-batch` が起票のみを繰り返すのに対し、こちらは起票済み Issue の実装から PR 化までを繰り返す。

**ユーザーが明示的に `/naw-frontend-issue-loop` を叩いたとき、またはこのフローの続行を明示したときのみ使うこと。** 特定の1Issueだけを対話的に進めたい場合は `naw-frontend-issue-workflow` を直接使う。backend Issue には `naw-issue-loop` を使う。

## 前提（合意済みの仕様）

- 対象は GitHub Projects の `Status = Todo` かつ `frontend-port` ラベル付き Issue のうち、Issue 番号が最も小さいもの
- `frontend-port` ラベルが backend Issue と区別する唯一の目印である
- 承認フローは省略し、常に全自動で進める
- 動作確認は自動テストを基本とし、可能なら `npm run dev` を使った確認を行う。難しければ `08_動作確認.md` に未確認として明記する
- 詰まった場合はその Issue をスキップし、Issue コメントへ理由を残して次へ進む
- 1サイクル1Issueで、並列実行はしない
- 対象がなくなったら停止し、ユーザーに報告する

## 実行手順

### 0. ループの開始

Codex は現在の作業ターンで「1. 対象 Issue の選定」から順に処理する。自動再起動や外部 AI 固有の loop は使わない。

### 1. 対象 Issue の選定

```bash
bash .codex/skills/naw-frontend-issue-loop/scripts/next_todo_frontend_issue.sh
```

- 出力が空の場合: 対象なし。停止する
- 番号が返った場合: その Issue を対象として「2. 実装〜PR作成」へ進む

念のため、選定した Issue に未マージ PR が既に存在しないか `gh pr list --state open` で確認する。既に PR がある場合はその Issue をスキップし、次の Todo を取得する。

### 2. 実装〜PR作成

Issue 1件分の「着手〜実装〜テスト〜PR作成〜code-review」を Codex が実行する。

- 対象 Issue 番号を明確に保持する
- `.codex/skills/naw-frontend-issue-workflow/SKILL.md` と `.codex/skills/naw-issue-workflow/references/doc-templates.md` を読み、手順に従う
- 以下のこのフロー独自の上書きルールを適用する
  1. 着手前に必ず `gh issue view {番号} --json title,body,labels` で本文とラベルを確認し、`frontend-port` ラベルが付いていることを確認する
  2. その上で `bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}` を実行する
  3. 第1承認・第2承認は省略し、常に全自動で進めてよい
  4. 自動テストは `npm run test`, `npm run lint`, `npm run type-check` を実行する
  5. 依存する backend API が未実装なら、無理にモックで成立させず BLOCKED として終了する
  6. 解消できないテスト失敗や仕様不明に遭遇した場合は、Issue に理由をコメントし、PR を作らず終了する
  7. 正常に完了できた場合は `naw-pr-workflow` に従って PR を作成し、`code-review.md` を更新する
  8. PR 本文には必ず `Closes #{Issue番号}` を入れる

最後に、PR 作成成功か BLOCKED 終了かを記録する。

### 3. 結果の確認

- PR 作成に成功した場合: PR URL をユーザーへ報告する
- BLOCKED で終了した場合: 理由を簡潔に報告する

### 4. 停止判定・次サイクル

- 対象 Issue がなければ、処理した件数と PR 一覧を報告して終了する
- まだ Todo が残っていれば「1. 対象 Issue の選定」へ戻る

## 停止方法

ユーザーが停止を指示した場合は、直ちに現在のループを止め、処理済み Issue と PR の一覧を報告する。
