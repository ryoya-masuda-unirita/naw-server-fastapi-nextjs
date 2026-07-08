---
name: naw-issue-batch
description: Use ONLY when the user explicitly invokes /naw-issue-batch or explicitly asks to bulk-create backend porting Issues for naw-server-fastapi-nextjs without implementing them. Repeatedly detects one unported unit (endpoint or controller, AI's judgment) from ~/Documents/naw-server and creates a GitHub Issue for it — no branch, no docs, no implementation, no PR. Stops after 10 issues per invocation or when candidates run out. Do not use for implementing a specific Issue (use naw-issue-workflow instead).
---

# NAW Issue Batch

`~/Documents/naw-server`（移植元）にある未移植のバックエンド機能を検出し、**Issueを起票するだけ**を繰り返すスキル。ブランチ作成・ドキュメント生成・実装・PR作成は一切行わない。

**ユーザーが明示的に `/naw-issue-batch` を叩いたとき、またはこのフローの続行を明示的に指示したときのみ使うこと。** 特定のIssueに着手して実装する場合は `naw-issue-workflow` を使う。

## 前提（合意済みの仕様）

- **毎サイクル、必ず `~/Documents/naw-server` の `develop` を最新化してから候補検出を行う**（`naw-explore`任せにせず、メインループ側でも明示的に最新化する。詳細は「1. 移植元の最新化」参照）
- **候補検出・粒度判断は常に、最新化した `~/Documents/naw-server` の `develop` を基準にする**。ローカルにキャッシュされた古い情報や記憶を使って判断しない
- 対象: バックエンド（FastAPI）優先
- **粒度はAIの判断**: 1エンドポイント単位にするか、関連する複数エンドポイントをまとめて1コントローラー単位にするかは、依存関係の強さ・レスポンス/リクエストの共有度合いを見てそのつど判断する。判断基準に迷う場合は1エンドポイント単位をデフォルトにする
- 重複防止は都度のライブチェックのみで行う（永続的な状態ファイルは持たない）。`naw-explore`に以下を必ず突き合わせさせる
  1. 最新化済みの `~/Documents/naw-server` の `develop`
  2. `backend/app/routers/` の既存実装
  3. `gh issue list --state all`
  4. `gh pr list --state open`
- **このスキルはIssue起票のみを行う**。ブランチ作成・`docs/issue-X/`生成・実装・PR作成は行わない（着手は別途 `naw-issue-workflow` または `naw-issue-workflow` ベースの他スキルに委ねる）
- **1回の起動につき最大10件**のIssueを起票したら停止する（セッション内カウントのみで管理し、状態ファイルは持たない）
- 移植候補が尽きたら（10件に達する前でも）停止し、ユーザーに報告する
- セッションが閉じればループも止まる（`ScheduleWakeup` はセッション内でのみ有効）。これは仕様として許容する

## 実行手順

### 0. ループの起動

自分自身がこのスキルの実行中に `loop` から再入場したものでなければ（＝ユーザーが `/naw-issue-batch` を直接叩いた最初の起動であれば）、真っ先に以下を行う。

```
Skill(skill="loop", args="/naw-issue-batch")
```

これにより `loop` スキルが自己ペースモードで起動し、以降は1サイクル完了ごとに `ScheduleWakeup` で次回起動が予約され、`/naw-issue-batch` のサイクル本体が繰り返し実行される。

`loop` から再入場した場合（`<<autonomous-loop-dynamic>>` 経由）は、このステップをスキップし、直接「1. 移植元の最新化」以降に進む。

初回起動時は、会話内カウンタ（起票済み件数）を `0` から開始する。

### 1. 移植元の最新化

候補検出に入る**前に必ず**、メインループ側で以下を実行し、`~/Documents/naw-server` の `develop` を最新化する。

```bash
cd ~/Documents/naw-server
git fetch
git checkout develop
git pull
```

- 未コミットのローカル変更等で`checkout`/`pull`が失敗する場合は、変更を破棄・上書きせず、状況をユーザーに報告して指示を仰ぐ
- ここで最新化した状態を、以降の候補検出・粒度判断すべての基準とする

### 2. 候補検出

この調査ステップは読み取り専用のリサーチであり、メインループのコンテキストを毎サイクル圧迫しないよう `naw-explore` エージェント（汎用の `Explore` ではなくこちらを使う）に委譲する。

- `Agent(subagent_type: naw-explore)` を呼び、以下を自己完結のプロンプトで依頼する（会話の前提を知らない前提で、必要な情報をすべてプロンプトに含めること）
  - `~/Documents/naw-server` は**呼び出し元（メインループ）側で既に `develop` を最新化済み**であることを伝え、`naw-explore` 側で改めて `git pull` 等の更新は行わせない（二重更新・競合を避けるため）。最新化済みのローカルの状態をそのまま読み取り、Controller群のエンドポイント一覧を洗い出すこと
  - `backend/app/routers/` の既存実装、`gh issue list --state all` の一覧、`gh pr list --state open` の一覧と突き合わせ、まだ移植されておらず・かつ起票済みIssueやオープンPRでも対応されていないエンドポイントを検出すること
  - 見つかった未対応エンドポイントについて、関連するエンドポイント同士（同一Controller内で密結合、同じDTO/レスポンスを共有する等）であれば1つの単位としてまとめてよいこと、そうでなければエンドポイント単位で個別に扱うことを伝え、まとめる場合・分ける場合それぞれの判断理由も返すよう指示する
  - 複数の独立した候補単位がある場合は、依存関係が少なく粒度が小さいものを1件だけ選ぶこと
  - 結果は「候補の有無」「単位（エンドポイント一覧）」「対応する移植元ファイルパス」「粒度をこうした理由」「選定理由」を簡潔に返すよう指示すること
- `naw-explore` の調査結果を受け取り、メインループ側で次のいずれかを行う
  - 候補あり: 「3. Issue起票」へ進む
  - **候補なし**: ループを停止する（`ScheduleWakeup(stop: true)` を呼ぶ）。ユーザーに「移植可能な候補が見つからなかったため停止した（起票件数: N件）」旨を報告して終了する

### 3. Issue起票

`naw-issue-workflow` の「Issue起票手順」に従う（`gh issue create` → `gh project item-add`）。承認は不要。ブランチ作成（`start_issue.sh`）・ドキュメント生成・実装は行わない。

起票後、会話内カウンタを+1する。

### 4. 上限・次サイクルの判定

- カウンタが**10に達した場合**: ループを停止する（`ScheduleWakeup(stop: true)`）。ユーザーに「上限の10件に達したため停止した」旨と、起票したIssue番号一覧を報告して終了する
- 10未満の場合: 起票結果を簡潔に報告したうえで、`ScheduleWakeup` で次回起動を予約する（間隔は目安として60〜120秒程度。`naw-explore`呼び出しのコストを踏まえ、キャッシュ窓を意識しつつ選ぶ）。`prompt` には `<<autonomous-loop-dynamic>>` を渡す

## 停止方法

ユーザーが「止めて」「停止して」等を指示した場合、直ちに `ScheduleWakeup(stop: true)` を呼び、現在までの起票件数・Issue番号一覧を報告する。
