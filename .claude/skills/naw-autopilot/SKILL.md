---
name: naw-autopilot
description: Use ONLY when the user explicitly invokes /naw-autopilot or explicitly asks to fully automate the Issue-to-merge development cycle for naw-server-fastapi-nextjs without per-step approval. Runs Issue triage → docs → implementation → test → PR → review → merge, then re-invokes itself via the loop skill indefinitely until the user stops it. Do not use for a single normal Issue (use naw-issue-workflow / naw-pr-workflow instead).
---

# NAW Autopilot

`naw-issue-workflow` / `naw-pr-workflow` の承認ゲート（第1承認・第2承認・HITLの都度確認）を**すべて省略**し、Issue起票からマージまでを無人・無限にループさせるスキル。

**ユーザーが明示的に `/naw-autopilot` を叩いたとき、またはこのフローの続行・再開を明示的に指示したときのみ使うこと。** 通常のIssue対応では `naw-issue-workflow` を使う。

## 前提（合意済みの仕様）

- Issue選定基準: `~/Documents/naw-server`（移植元）の未移植エンドポイント・機能を順番に検出して起票する
- 対象: バックエンド（FastAPI）優先。着手確認は毎回省略する
- ドキュメント: `00`〜`08` を承認待ちせず一括生成する
- Merge条件（**すべて**満たした場合のみ `gh pr merge` を実行）
  1. `backend/` で `pytest` が全件グリーン
  2. `ruff check app tests` / `mypy app/` がエラーなし
  3. `/code-review` の結果に 🔴 致命的指摘が残っていない
  4. 動作確認（`curl` によるAPI呼び出し）が期待通りのレスポンスであること
- Merge先は必ず `develop`。`main` には直接マージしない
- 同一Issueでの実装〜テストの再試行は**最大3回**。3回失敗したらループを停止し、ユーザーに報告する
- 移植候補が0件になったらループを停止し、ユーザーに報告する
- セッションが閉じればループも止まる（`ScheduleWakeup` はセッション内でのみ有効）。これは仕様として許容する

## 状態ファイル

`.claude/skills/naw-autopilot/state.json`（gitignore 対象。コミットしない）に現在の進行状況を保存し、中断・再開に対応する。

```json
{
  "issueNumber": 56,
  "issueSlug": "issue-56",
  "step": "implementation",
  "attempt": 1,
  "updatedAt": "2026-07-08T12:00:00+09:00"
}
```

`step` の取り得る値: `candidate_search` / `issue_create` / `branch_start` / `docs` / `implementation` / `test` / `verify` / `pr_create` / `code_review` / `merge` / `idle`

- サイクル開始時、まず本ファイルの有無を確認する
  - **存在する場合**: 中断からの再開とみなし、`step` に記録されたステップから再開する。`docs/<issueSlug>/06_タスクリスト.md` の `- [x]` 状況も合わせて確認し、実際にどこまで終わっているかを裏取りしてから再開する
  - **存在しない場合**: 新規サイクルとして `candidate_search` から開始する
- 各ステップ完了時に **即座に** `step` とタイムスタンプを更新する（まとめて更新しない）
- サイクル完遂（マージ完了）または停止時に、ファイルを削除する（削除 = 次回は新規サイクルとして開始）

## 実行手順

### 0. ループの起動

自分自身がこのスキルの実行中に `loop` から再入場したものでなければ（＝ユーザーが `/naw-autopilot` を直接叩いた最初の起動であれば）、真っ先に以下を行う。

```
Skill(skill="loop", args="/naw-autopilot")
```

これにより `loop` スキルが自己ペースモードで起動し、以降は1サイクル完了ごとに `ScheduleWakeup` で次回起動が予約され、`/naw-autopilot` のサイクル本体が繰り返し実行される。

`loop` から再入場した場合（`<<autonomous-loop-dynamic>>` 経由）は、このステップをスキップし、直接「1. 移植候補の検出」以降（または状態ファイルに従った再開ステップ）に進む。

### 1. 移植候補の検出（`candidate_search`）

この調査ステップは読み取り専用のリサーチであり、メインループのコンテキストを毎サイクル圧迫しないよう `naw-explore` エージェント（このリポジトリの移植前提を組み込んだ専用エージェント。汎用の `Explore` ではなくこちらを使う）に委譲する。

- `Agent(subagent_type: naw-explore)` を呼び、以下を自己完結のプロンプトで依頼する（会話の前提を知らない前提で、必要な情報をすべてプロンプトに含めること）
  - `~/Documents/naw-server` を最新化した上で、`RoomController` 等の Controller 群のエンドポイント一覧を洗い出すこと
  - `backend/app/routers/` の既存実装（および `gh issue list --state all` の一覧）と突き合わせ、まだ移植されていないエンドポイントを検出すること
  - 複数候補がある場合は、依存関係が少なく粒度が小さいものを優先して1件に絞ること
  - 結果は「候補の有無」「エンドポイント（メソッド・パス）」「対応する移植元ファイルパス」「選定理由」を簡潔に返すよう指示すること
- `naw-explore` エージェントの調査結果を受け取り、メインループ側で次のいずれかを行う
  - 候補あり: その内容をもとに「2. Issue起票」へ進む（`gh issue create` 等の書き込みはメインループ側で実行する。`naw-explore` は書き込みツールを持たないため実行できない）
  - **候補なし**: ループを停止する（`ScheduleWakeup(stop: true)` を呼ぶ）。状態ファイルを削除し、ユーザーに「移植可能な候補が見つからなかったため停止した」旨を報告して終了する

### 2. Issue起票（`issue_create`）

`naw-issue-workflow` の「Issue起票手順」に従う（`gh issue create` → `gh project item-add`）。承認は不要。

### 3. ブランチ作成（`branch_start`）

`start_issue.sh issue-{番号}` を実行する。

### 4. ドキュメント生成（`docs`）

`naw-issue-workflow` の `references/doc-templates.md` に従い、`00`〜`08` を**第1承認・第2承認を待たず**一括生成し、コミット・プッシュする。

### 5. 実装・テスト（`implementation` → `test`）

`06_タスクリスト.md` のタスクを順に実行する。各項目の完了ごとにチェックし、`state.json` の `attempt` を更新する。

- `pytest` / `ruff check app tests` / `mypy app/` を実行する
- 失敗した場合は原因を修正して再実行する。**同一Issueでの試行回数が3回を超えたら**、ループを停止し（`ScheduleWakeup(stop: true)`）、状態ファイルは残したまま（次回人間が見て再開判断できるように）ユーザーに詳細を報告して終了する

### 6. 動作確認（`verify`）

ローカルサーバー（`uvicorn`）を起動し、`curl` で対象APIを実際に呼び出して期待レスポンスを確認する。ブラウザ操作は行わない（無人実行のため）。結果を `08_動作確認.md` に記録する。

### 7. PR作成（`pr_create`）

`naw-pr-workflow` のフォーマットに従い、`Closes #{番号}` を含む PR を作成する。

### 8. コードレビュー（`code_review`）

`/code-review` を実行し、`code-review.md` を作成する。🔴致命的指摘は修正して再テスト・再動作確認する（5・6に戻る。これも試行回数のカウントに含める）。🟡🔵は自動判断してよい。

### 9. マージ（`merge`）

「前提」節の Merge条件（1〜4）を**すべて**満たしていることを確認したうえで `gh pr merge --merge`（またはリポジトリの既定戦略）を実行する。マージ後、状態ファイルを削除する。

### 10. 次サイクルへ

マージ完了をユーザーに簡潔に報告したうえで、`ScheduleWakeup` で次回起動を予約する（間隔は目安として60〜120秒程度。次サイクルの重さを踏まえ、キャッシュ窓を意識しつつ選ぶ）。`prompt` には `<<autonomous-loop-dynamic>>` を渡す。

## 中断からの再開

ユーザーが「再開して」「続きから」等、続行を明示的に指示してこのスキルが呼ばれた場合:

1. `state.json` の有無を確認する
2. 存在すれば、記録された `issueSlug` の `docs/<issueSlug>/06_タスクリスト.md` を読み、実際の完了状況を裏取りする
3. 裏取りした実態に基づいて、記録された `step` から処理を再開する
4. 再開後は通常どおり「0. ループの起動」からの `Skill(skill="loop", args="/naw-autopilot")` 呼び出しも行い、以降は自動継続する

## 停止方法

ユーザーが「止めて」「停止して」等を指示した場合、直ちに `ScheduleWakeup(stop: true)` を呼び、現在の状態を報告する。状態ファイルは削除しない（人間が途中経過を確認できるように残す）。
