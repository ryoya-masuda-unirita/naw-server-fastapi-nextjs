---
name: naw-issue-loop
description: Use ONLY when the user explicitly invokes /naw-issue-loop or explicitly asks to work through open backend porting Issues one by one end-to-end (branch → docs → implementation → tests → PR) for naw-server-fastapi-nextjs. Repeatedly picks the lowest-numbered GitHub Projects "Todo" issue, runs naw-issue-workflow in full-auto mode (no HITL approval gates, automated tests substitute for browser verification), then naw-pr-workflow to open a PR with code-review.md. Skips an issue (leaving it commented/in-progress) and moves to the next if blocked. Stops when no Todo issues remain. Do not use for interactively working a single issue (use naw-issue-workflow) or for just filing issues (use naw-issue-batch).
---

# NAW Issue Loop

GitHub Projects の `Todo` 状態にある Issue を1件ずつ、着手からPR作成まで通しで自動処理するスキル。`naw-issue-batch` が「起票のみ」を繰り返すのに対し、こちらは「起票済みIssueの実装〜PR化」を繰り返す。

**ユーザーが明示的に `/naw-issue-loop` を叩いたとき、またはこのフローの続行を明示的に指示したときのみ使うこと。** 特定の1Issueだけを対話的に進めたい場合は `naw-issue-workflow` を直接使う。Issueを起票するだけなら `naw-issue-batch` を使う。

## 前提（合意済みの仕様）

- **対象Issueの選び方**: GitHub Projects（プロジェクト番号 `3`、オーナー `ryoya-masuda-unirita`）の `Status = Todo` かつ `type = Issue` のうち、Issue番号が最も小さいものを1件選ぶ。バッチで起票した特定の番号に限定しない（今後Todoに入ったIssueも汎用的に拾う）
- **承認フロー**: `naw-issue-workflow` の第1承認（設計承認）・第2承認（実装方式選択）は**省略し、常に全自動モードで進める**。ユーザーに立ち止まって承認を求めない
- **動作確認の代替**: `naw-issue-workflow` 全自動モードのステップ3「動作確認（ブラウザ操作）」は、**pytest等の自動テストのみで代替する**。ブラウザでの実操作確認は行わない。`08_動作確認.md` には「自動テストのみで代替」である旨を明記する
- **詰まったときの扱い**: テスト失敗が解消できない、仕様が不明で設計判断がつかない等でこれ以上進められない場合は、**そのIssueをスキップして次のIssueに進む**。ループ全体は止めない
  - スキップする際は、それまでの作業（ブランチ・ドキュメント）は残したまま、対象Issueに詰まった理由をコメントで残す
  - Project Status は `In Progress` のまま残し、勝手に `Todo` へ戻したり `Done` にしたりしない（人間の判断に委ねる）
  - 中途半端な実装のままPRは作成しない
- **1サイクル1Issue**: 1サイクルにつき1つのIssueをブランチ作成からPR作成まで通しで処理する。並列実行はしない（同一リポジトリの作業ディレクトリを使い回すため）
- 重複防止は都度のライブチェックのみで行う（永続的な状態ファイルは持たない）
- 対象がなくなったら（`Todo` のIssueがなくなったら）停止し、ユーザーに報告する

## 実行手順

### 0. ループの開始

Codex は現在の作業ターンで「1. 対象Issueの選定」から順に処理する。1Issueの処理が終わったら、ユーザーから停止指示がない限り次のTodo Issueを探す。長時間化・外部承認待ち・環境ブロックで継続できない場合は、そこまでの結果を報告して停止する。

### 1. 対象Issueの選定

```bash
bash .codex/skills/naw-issue-loop/scripts/next_todo_issue.sh
```

- 出力が空の場合: 対象なし。「4. 停止判定」へ進み、ループを停止する
- 番号が返った場合: そのIssue番号を対象として「2. 実装〜PR作成」へ進む

念のため、選定したIssueに紐づく未マージPRが既に存在しないか `gh pr list --state open` で確認する。既にPRがある場合はそのIssueをスキップし、再度スクリプトを実行して次のTodoを取得する（ただし同じ番号しか返らない場合は、そのIssueの `content.number` を除外して手動で次点を選ぶ）。

### 2. 実装〜PR作成

Issue1件分の「着手〜実装〜テスト〜PR作成〜code-review」一式を Codex が実行する。作業は1Issueずつ順番に進め、同じ作業ディレクトリで複数Issueを並行実装しない。

作業時は以下を守る。

- 対象Issue番号を明確に保持する
- `~/Documents/naw-server-fastapi-nextjs` の `.codex/skills/naw-issue-workflow/SKILL.md` と `.codex/skills/naw-issue-workflow/references/doc-templates.md` を読んで、そこに書かれた手順（起票済みIssueへの着手〜ドキュメント作成〜実装〜テスト〜PR作成）に従うこと
- 以下の**このフロー独自の上書きルール**を適用すること（`naw-issue-workflow` のデフォルトと異なる部分なので読み違えないようにする）:
  1. **着手前に必ず `gh issue view {番号} --json title,body` でIssue本文を確認し、`NAW-XXXX` 形式の元チケット参照があるかを判定すること。** その上で `bash .codex/skills/naw-issue-workflow/scripts/start_issue.sh` を次のいずれかの引数で実行する（このスクリプトが `develop` の最新化・`feature/issue-*` ブランチの作成・checkout・linked branch反映・`In Progress`移動をすべて行う。これを飛ばして直接 `git checkout -b` 等をしないこと）
     - NAW番号の記載なし: `issue-{番号}`（→ `feature/issue-{番号}` ブランチ、`docs/issue-{番号}/`）
     - `NAW-XXXX` の記載あり: `issue-{番号}-NAW-XXXX`（→ `feature/issue-{番号}-NAW-XXXX` ブランチ、`docs/issue-{番号}-NAW-XXXX/`）
     - `naw-issue-batch` で自動起票したIssue（#64, #66〜#72等）は元チケット参照がないため、通常は `issue-{番号}` のみになる想定
  2. 第1承認・第2承認は省略し、常に「全自動」で進めてよい。ユーザーに立ち止まって確認を取らない
  3. `08_動作確認.md` のブラウザ操作による確認は行わず、自動テスト（pytest等）の実行結果のみで代替し、その旨をファイルに明記する
  4. 実装中に解消できないテスト失敗・仕様不明に遭遇し、これ以上進められないと判断した場合は、無理に実装を完成させようとせず、作業ブランチとドキュメントはそのまま残し、対象Issueに詰まった理由をコメントで残した上で「BLOCKED」として作業を終了する（PRは作らない、Project Statusは変更しない）
  5. 正常に完了できた場合は、`naw-pr-workflow` の [SKILL.md](../naw-pr-workflow/SKILL.md) に従いPRを作成し、ベースブランチ差分でのコードレビューを実行して `code-review.md` を作成し、🔴致命的指摘があれば修正すること。PR本文には必ず `Closes #{Issue番号}` を入れること
  6. コミットメッセージ規約・ブランチ命名規約はプロジェクトの `AGENTS.md` に従うこと
- 最後に「PR作成に成功したか」「BLOCKEDで終わったか」を明確に記録する（成功した場合はPR URLとブランチ名、BLOCKEDの場合は理由を含める）

### 3. 結果の確認

作業結果として以下のいずれかを確認する。

- **PR作成に成功**: PR URLをユーザーに報告する
- **BLOCKEDで終了**: 理由を簡潔にユーザーに報告する（詳細はIssueコメントを参照するよう案内してよい）

いずれの場合も、対象Issueの処理は「1周」として扱い、次のサイクルに進む。

### 4. 停止判定・次サイクル

- 対象Issueがなかった場合（Todoが尽きた場合）: これまでに処理したIssue件数・PR URL一覧を報告して終了する
- まだTodoが残っている場合: 結果を簡潔に記録した上で「1. 対象Issueの選定」へ戻る。長時間化や環境ブロックにより同一ターンで続行できない場合は、処理済みIssueと残状況を報告して停止する

## 停止方法

ユーザーが「止めて」「停止して」等を指示した場合、直ちに現在のループを止め、現在までに処理したIssue・PRの一覧を報告する。
