---
name: naw-issue-batch
description: Use ONLY when the user explicitly invokes /naw-issue-batch or explicitly asks to bulk-create backend porting Issues for naw-server-fastapi-nextjs without implementing them. Repeatedly detects one unported unit (endpoint or controller, AI's judgment) from ~/Documents/naw-server and creates a GitHub Issue for it — no branch, no docs, no implementation, no PR. Stops after 10 issues per invocation or when candidates run out. Do not use for implementing a specific Issue (use naw-issue-workflow instead).
---

# NAW Issue Batch

`~/Documents/naw-server`（移植元）にある未移植のバックエンド機能を検出し、**Issueを起票するだけ**を繰り返すスキル。ブランチ作成・ドキュメント生成・実装・PR作成は一切行わない。

**ユーザーが明示的に `/naw-issue-batch` を叩いたとき、またはこのフローの続行を明示的に指示したときのみ使うこと。** 特定のIssueに着手して実装する場合は `naw-issue-workflow` を使う。

## 前提（合意済みの仕様）

- **毎サイクル、必ず `~/Documents/naw-server` の `develop` を最新化してから候補検出を行う**（詳細は「1. 移植元の最新化」参照）
- **候補検出・粒度判断は常に、最新化した `~/Documents/naw-server` の `develop` を基準にする**。ローカルにキャッシュされた古い情報や記憶を使って判断しない
- 対象: バックエンド（FastAPI）優先
- **粒度はAIの判断**: 1エンドポイント単位にするか、関連する複数エンドポイントをまとめて1コントローラー単位にするかは、依存関係の強さ・レスポンス/リクエストの共有度合いを見てそのつど判断する。判断基準に迷う場合は1エンドポイント単位をデフォルトにする
- 重複防止は都度のライブチェックのみで行う（永続的な状態ファイルは持たない）。候補検出では以下を必ず突き合わせる
  1. 最新化済みの `~/Documents/naw-server` の `develop`
  2. `backend/app/routers/` の既存実装
  3. `gh issue list --state all`
  4. `gh pr list --state open`
- **このスキルはIssue起票のみを行う**。ブランチ作成・`docs/issue-X/`生成・実装・PR作成は行わない（着手は別途 `naw-issue-workflow` で行う）
- **1回の起動につき最大10件**のIssueを起票したら停止する（セッション内カウントのみで管理し、状態ファイルは持たない）
- 移植候補が尽きたら（10件に達する前でも）停止し、ユーザーに報告する
- セッションが閉じればループも止まる。これは仕様として許容する

## 実行手順

### 0. 実行上限の確認

`/naw-issue-batch` の実行中は、起票済み件数を記録し、最大10件まで現在の作業として順番に処理する。途中でユーザーが停止を指示した場合は即時停止する。

### 1. 移植元の最新化

候補検出に入る**前に必ず**、以下を実行し、`~/Documents/naw-server` の `develop` を最新化する。

```bash
cd ~/Documents/naw-server
git fetch
git checkout develop
git pull
```

- 未コミットのローカル変更等で`checkout`/`pull`が失敗する場合は、変更を破棄・上書きせず、状況をユーザーに報告して指示を仰ぐ
- ここで最新化した状態を、以降の候補検出・粒度判断すべての基準とする

### 2. 候補検出

この調査ステップは読み取り専用のリサーチである。Codex が以下を直接確認して、未移植候補を1件だけ選ぶ。

- 最新化済みの `~/Documents/naw-server` の状態を読み取り、Controller群のエンドポイント一覧を洗い出す
- `backend/app/routers/` の既存実装、`gh issue list --state all`、`gh pr list --state open` と突き合わせる
- まだ移植されておらず、起票済みIssueやオープンPRでも対応されていないエンドポイントを検出する
- 関連するエンドポイント同士（同一Controller内で密結合、同じDTO/レスポンスを共有する等）であれば1つの単位としてまとめてよい。そうでなければエンドポイント単位で個別に扱う
- 複数の独立した候補単位がある場合は、依存関係が少なく粒度が小さいものを1件だけ選ぶ
- 「候補の有無」「単位（エンドポイント一覧）」「対応する移植元ファイルパス」「粒度をこうした理由」「選定理由」を簡潔に整理する

調査結果をもとに、次のいずれかを行う。

  - 候補あり: 「3. Issue起票」へ進む
  - **候補なし**: ループを停止する。ユーザーに「移植可能な候補が見つからなかったため停止した（起票件数: N件）」旨を報告して終了する

### 3. Issue起票

`naw-issue-workflow` の「Issue起票手順」に従う（`gh issue create` → `gh project item-add`）。承認は不要。ブランチ作成（`start_issue.sh`）・ドキュメント生成・実装は行わない。

起票後、起票済み件数を+1する。

### 4. 上限・次サイクルの判定

- 起票済み件数が**10に達した場合**: ループを停止する。ユーザーに「上限の10件に達したため停止した」旨と、起票したIssue番号一覧を報告して終了する
- 10未満の場合: 起票結果を簡潔に記録したうえで、「1. 移植元の最新化」へ戻って次候補を探す

## 停止方法

ユーザーが「止めて」「停止して」等を指示した場合、直ちに現在のループを止め、現在までの起票件数・Issue番号一覧を報告する。
