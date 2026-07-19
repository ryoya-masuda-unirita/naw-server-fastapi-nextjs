---
name: naw-frontend-issue-loop
description: Use ONLY when the user explicitly invokes /naw-frontend-issue-loop or explicitly asks to work through open frontend porting Issues (Angular secuaigent/client to React frontend/) one by one end-to-end (branch → docs → implementation → tests → PR) for naw-server-fastapi-nextjs. Repeatedly picks the lowest-numbered GitHub Projects "Todo" issue labeled frontend-port, runs naw-frontend-issue-workflow in full-auto mode (no HITL approval gates, automated tests + dev server verification substitute for manual browser walkthroughs where possible), then naw-pr-workflow to open a PR with code-review.md. Skips an issue (leaving it commented/in-progress) and moves to the next if blocked. Stops when no Todo frontend-port issues remain. Do not use for interactively working a single issue (use naw-frontend-issue-workflow) or for just filing issues (use naw-frontend-issue-batch). Do not use for backend issues (use naw-issue-loop instead).
---

# NAW Frontend Issue Loop

GitHub Projects の `Todo` 状態にある、**`frontend-port` ラベル付きIssue**を1件ずつ、着手からPR作成まで通しで自動処理するスキル。バックエンド版の `naw-issue-loop` のフロントエンド対になるスキル。`naw-frontend-issue-batch` が「起票のみ」を繰り返すのに対し、こちらは「起票済みIssueの実装〜PR化」を繰り返す。

**ユーザーが明示的に `/naw-frontend-issue-loop` を叩いたとき、またはこのフローの続行を明示的に指示したときのみ使うこと。** 特定の1Issueだけを対話的に進めたい場合は `naw-frontend-issue-workflow` を直接使う。Issueを起票するだけなら `naw-frontend-issue-batch` を使う。バックエンドIssueの処理には `naw-issue-loop` を使う。

## 前提（合意済みの仕様）

- **対象Issueの選び方**: GitHub Projects（プロジェクト番号 `3`、オーナー `ryoya-masuda-unirita`）の `Status = Todo` かつ `frontend-port` ラベルが付いたIssueのうち、Issue番号が最も小さいものを1件選ぶ。同じプロジェクトボード上にバックエンド移植Issue（ラベルなし）も混在しているため、**必ず `frontend-port` ラベルで絞り込む**（このラベルが唯一の区別手段）
- **承認フロー**: `naw-frontend-issue-workflow` の第1承認（設計承認）・第2承認（実装方式選択）は**省略し、常に全自動モードで進める**。ユーザーに立ち止まって承認を求めない
- **動作確認の代替**: `naw-frontend-issue-workflow` 全自動モードのステップ3「動作確認」は、自動テスト（`npm run test`・`npm run lint`・`npm run type-check`）に加えて、可能であれば `npm run dev` を起動しPlaywright等で実際の画面をスクリーンショット取得して確認する。スクリーンショット取得が困難な場合は自動テストのみで代替してよいが、その旨を `08_動作確認.md` に明記する
- **詰まったときの扱い**: テスト失敗が解消できない、依存するバックエンドAPIが未実装、仕様が不明で設計判断がつかない等でこれ以上進められない場合は、**そのIssueをスキップして次のIssueに進む**。ループ全体は止めない
  - スキップする際は、それまでの作業（ブランチ・ドキュメント）は残したまま、対象Issueに詰まった理由をコメントで残す
  - Project Status は `In Progress` のまま残し、勝手に `Todo` へ戻したり `Done` にしたりしない（人間の判断に委ねる）
  - 中途半端な実装のままPRは作成しない
- **1サイクル1Issue**: 1サイクルにつき1つのIssueをブランチ作成からPR作成まで通しで処理する。並列実行はしない（同一リポジトリの作業ディレクトリを使い回すため）
- 重複防止は都度のライブチェックのみで行う（永続的な状態ファイルは持たない）
- 対象がなくなったら（`frontend-port` ラベル付きの `Todo` Issueがなくなったら）停止し、ユーザーに報告する

## 実行手順

### 0. ループの起動

自分自身がこのスキルの実行中に `loop` から再入場したものでなければ（＝ユーザーが `/naw-frontend-issue-loop` を直接叩いた最初の起動であれば）、真っ先に以下を行う。

```
Skill(skill="loop", args="/naw-frontend-issue-loop")
```

これにより `loop` スキルが自己ペースモードで起動し、以降は1Issue処理完了ごとに `ScheduleWakeup` で次回起動が予約され、`/naw-frontend-issue-loop` のサイクル本体が繰り返し実行される。

`loop` から再入場した場合（`<<autonomous-loop-dynamic>>` 経由）は、このステップをスキップし、直接「1. 対象Issueの選定」以降に進む。

### 1. 対象Issueの選定

```bash
bash .claude/skills/naw-frontend-issue-loop/scripts/next_todo_frontend_issue.sh
```

- 出力が空の場合: 対象なし。「4. 停止判定」へ進み、ループを停止する
- 番号が返った場合: そのIssue番号を対象として「2. 実装〜PR作成の委譲」へ進む

念のため、選定したIssueに紐づく未マージPRが既に存在しないか `gh pr list --state open` で確認する。既にPRがある場合はそのIssueをスキップし、再度スクリプトを実行して次のTodoを取得する（ただし同じ番号しか返らない場合は、そのIssueの番号を除外して手動で次点を選ぶ）。

### 2. 実装〜PR作成の委譲

メインの会話コンテキストを圧迫しないよう、Issue1件分の「着手〜実装〜テスト〜PR作成〜code-review」一式を `Agent(subagent_type: claude)` に委譲する。会話の前提を知らない前提で、以下を自己完結のプロンプトに含めること。

- 対象Issue番号
- `~/Documents/naw-server-fastapi-nextjs` の `.claude/skills/naw-frontend-issue-workflow/SKILL.md`（および参照先の `.claude/skills/naw-issue-workflow/references/doc-templates.md`）を読んで、そこに書かれた手順（起票済みIssueへの着手〜ドキュメント作成〜実装〜テスト〜PR作成）に従うこと
- `frontend/.claude/CLAUDE.md`（技術スタック・Angular→React対応表・デザイン移行方針）を必ず読んで実装に反映すること
- 以下の**本スキル独自の上書きルール**を明示すること（`naw-frontend-issue-workflow` のデフォルトと異なる部分なので、エージェントが読み違えないよう強調する）:
  1. **着手前に必ず `gh issue view {番号} --json title,body,labels` でIssue本文とラベルを確認し、`frontend-port` ラベルが付いていることを確認すること。** その上で `bash .claude/skills/naw-issue-workflow/scripts/start_issue.sh issue-{番号}` を実行する（このスクリプトが `develop` の最新化・`feature/issue-{番号}` ブランチの作成・checkout・linked branch反映・`In Progress`移動をすべて行う。これを飛ばして直接 `git checkout -b` 等をしないこと）
  2. 第1承認・第2承認は省略し、常に「全自動」で進めてよい。ユーザーに立ち止まって確認を取らない
  3. 動作確認は `npm run test`・`npm run lint`・`npm run type-check` を実行し、可能であれば `npm run dev`（`http://localhost:5173`）を起動してPlaywright等でスクリーンショットを取得する。スクリーンショット取得が困難な場合は自動テストのみで代替し、その旨を `08_動作確認.md` に明記する
  4. 依存するバックエンドAPIが `backend/` に未実装であることが判明した場合、無理にモックで実装を完成させようとせず、「BLOCKED」として作業を終了する（実装対象がフロントエンドのみのIssueに限定されているはずだが、調査不足で見落としがあった場合の保険）
  5. 実装中に解消できないテスト失敗・仕様不明に遭遇し、これ以上進められないと判断した場合は、無理に実装を完成させようとせず、作業ブランチとドキュメントはそのまま残し、対象Issueに詰まった理由をコメントで残した上で「BLOCKED」として作業を終了する（PRは作らない、Project Statusは変更しない）
  6. 正常に完了できた場合は、`naw-pr-workflow` の [SKILL.md](../naw-pr-workflow/SKILL.md) に従いPRを作成し、`/code-review` を実行して `code-review.md` を作成し、🔴致命的指摘があれば修正すること。PR本文には必ず `Closes #{Issue番号}` を入れること
  7. コミットメッセージ規約・ブランチ命名規約はプロジェクトの `.claude/CLAUDE.md` に従うこと
- 最後に「PR作成に成功したか」「BLOCKEDで終わったか」を明確に報告するよう指示する（成功した場合はPR URLとブランチ名、BLOCKEDの場合は理由を含めて）

`isolation` は指定しない(同一リポジトリを順番に使うため worktree 分離は不要。並列実行しない前提と矛盾するため)。

### 3. 結果の確認

エージェントの完了報告を受け取り、以下のいずれかを確認する。

- **PR作成に成功**: PR URLをユーザーに報告する
- **BLOCKEDで終了**: 理由を簡潔にユーザーに報告する（詳細はIssueコメントを参照するよう案内してよい）

いずれの場合も、対象Issueの処理は「1周」として扱い、次のサイクルに進む。

### 4. 停止判定・次サイクルの予約

- 対象Issueがなかった場合（`frontend-port` の Todo が尽きた場合）: `ScheduleWakeup(stop: true)` を呼び、これまでに処理したIssue件数・PR URL一覧を報告して終了する
- まだTodoが残っている場合: 結果を簡潔に報告した上で、`ScheduleWakeup` で次回起動を予約する（1Issueあたりの実装は数分〜数十分かかるため、間隔は1200〜1800秒程度を目安にする）。`prompt` には `<<autonomous-loop-dynamic>>` を渡す

## 停止方法

ユーザーが「止めて」「停止して」等を指示した場合、直ちに `ScheduleWakeup(stop: true)` を呼び、現在までに処理したIssue・PRの一覧を報告する。
