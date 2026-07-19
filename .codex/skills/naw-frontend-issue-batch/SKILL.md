---
name: naw-frontend-issue-batch
description: Use ONLY when the user explicitly invokes /naw-frontend-issue-batch or explicitly asks to bulk-create frontend porting Issues (Angular secuaigent/client → React frontend/) for naw-server-fastapi-nextjs without implementing them. Repeatedly detects one unported unit (screen or component, AI's judgment) from ~/Documents/secuaigent/client and creates a GitHub Issue labeled frontend-port. Stops after 10 issues per invocation or when candidates run out.
---

# NAW Frontend Issue Batch

`~/Documents/secuaigent/client` にある未移植の frontend 画面・コンポーネントを検出し、Issue を起票するだけを繰り返す skill。ブランチ作成、ドキュメント生成、実装、PR 作成は行わない。

**ユーザーが明示的に `/naw-frontend-issue-batch` を叩いたとき、またはこのフローの続行を明示したときのみ使うこと。** 特定の Issue に着手して実装する場合は `naw-frontend-issue-workflow` を使う。backend 移植の Issue 起票には `naw-issue-batch` を使う。

## 前提（合意済みの仕様）

- 毎サイクル、必ず `~/Documents/secuaigent/client` の `develop` を最新化してから候補検出を行う
- 候補検出・粒度判断は、最新化した `develop` の状態を基準にする
- 粒度は AI の判断とし、迷う場合は1画面単位をデフォルトにする
- 依存する backend API が `backend/` に未実装の候補は除外する
- 重複防止は都度のライブチェックのみで行い、以下を突き合わせる
  1. 最新化済みの `~/Documents/secuaigent/client`
  2. `frontend/src/` の既存実装
  3. `backend/app/routers/` の対応 API 実装状況
  4. `gh issue list --state all`（特に `frontend-port` ラベル付き Issue）
  5. `gh pr list --state open`
- この skill は Issue 起票のみを行う
- 1回の起動につき最大10件まで起票したら停止する
- 候補が尽きたらその時点で停止する

## 実行手順

### 0. ループの開始

`/naw-frontend-issue-batch` の実行中は、起票済み件数と起票した Issue 番号を会話内で記録し、最大10件まで現在の作業ターンで順番に処理する。外部 AI 固有の loop 機能は使わない。

### 1. 移植元の最新化

候補検出に入る前に必ず、以下を実行して `~/Documents/secuaigent/client` の `develop` を最新化する。

```bash
cd ~/Documents/secuaigent/client
git fetch
git checkout develop
git pull
```

- 未コミット変更で失敗する場合は、変更を破棄せずユーザーへ報告する
- `secuaigent/client` は途中から git 管理のため、`git log` だけでなくコード自体も読むこと

### 2. 候補検出

この調査ステップは読み取り専用であり、Codex が直接確認して1件だけ選ぶ。

- 最新化済みの `secuaigent/client` を読み取り、画面・コンポーネント一覧を洗い出す
- `frontend/src/` の既存実装、`backend/app/routers/` の API 実装状況、`gh issue list --state all`、`gh pr list --state open` と突き合わせる
- まだ移植されておらず、起票済み Issue やオープン PR でも対応されていない単位を検出する
- 関連する画面・コンポーネント同士で密結合なら1つにまとめてよい
- 複数候補がある場合は、依存する backend API が実装済みで粒度が小さいものを優先する
- 「候補の有無」「単位」「移植元ファイルパス」「依存 API の実装状況」「粒度理由」「選定理由」を整理する

候補ありなら「3. Issue 起票」へ進み、候補なしなら停止する。

### 3. Issue 起票

`naw-frontend-issue-workflow` の Issue 起票手順に従う。`frontend-port` ラベル付与を忘れないこと。承認は不要。ブランチ作成、`docs/issue-*` 生成、実装は行わない。

起票後、起票済み件数を+1する。

### 4. 上限・次サイクルの判定

- 起票済み件数が10に達したら停止する
- 10未満なら結果を簡潔に記録したうえで、「1. 移植元の最新化」へ戻る

## 停止方法

ユーザーが停止を指示した場合は、直ちに現在のループを止め、現在までの起票件数・Issue 番号一覧を報告する。
