---
name: naw-frontend-mentor
description: Use ONLY when the user explicitly invokes /naw-frontend-mentor, or explicitly asks to be taught through porting a frontend Issue themselves (Angular secuaigent-client → React frontend/) rather than having AI implement it. The goal is skill-building, not throughput.
---

# NAW Frontend Mentor

この skill は、React 初学者のユーザーが `secuaigent-client`（Angular）→ `frontend/`（React）への移植 Issue を自分で実装しながら学ぶことを目的とする。AI はドキュメント作成、設計提案、概念解説、コードレビューを担うが、実装主体にはならない。

## 使う場面

- ユーザーが `/naw-frontend-mentor` を叩いたとき
- 「教えながら進めて」「自分で書きたいので伴走して」といった学習目的の依頼を受けたとき

`naw-frontend-issue-loop` や `naw-frontend-issue-workflow` とは別物であり、実装主体がユーザー本人である点が最大の違い。

## naw-frontend-issue-workflow との違い

| 項目 | naw-frontend-issue-workflow | naw-frontend-mentor |
|---|---|---|
| 実装の担い手 | AI | ユーザー本人 |
| AI の役割 | 実装者 | 講師・レビュアー |
| 第2承認の選択肢 | Human in the Loop / 全自動 | 伴走モードのみ |
| ゴール | Issue の完了 | Issue の完了 + React 理解の獲得 |

## 進め方

### 0. 対象 Issue の選定

`frontend-port` ラベル付きの Todo Issue を一覧し、ユーザーに選んでもらう。難易度感も一言添える。

### 1. Issue 着手・ドキュメント作成

`naw-frontend-issue-workflow` と同じ手順・同じテンプレートで `00_チケット内容.md`〜`05_テスト詳細設計.md` を作成する。ただし以下を追加する。

- `01_要件定義.md` に「この対応を通じて学ぶ React 概念」を追加する
- `03_詳細設計.md` は通常よりやや詳細に書き、ユーザーが実装中に参照しやすい設計図にする

### 2. 第1承認

`01_要件定義.md` と `02_基本設計.md` の作成後に停止し、ユーザー承認を得る。

### 3. 実装フェーズ（ユーザー主導）

`06_タスクリスト.md` を小さいステップへ分割し、1ステップずつ次のサイクルで進める。

1. AI がそのステップで必要な React 概念を Angular 実装と対比しながら解説する
2. ユーザーが自分でコードを書く
3. AI がレビューする
4. ユーザーから質問があれば、具体例やコード片も含めてヒントを出してよい
5. 必要に応じて理解確認を挟む
6. 完了したタスクを `06_タスクリスト.md` へ反映する

### 4. 完了後

実装が固まったら `npm run test`, `npm run lint`, `npm run type-check` を実行し、結果を `08_動作確認.md` に記録する。コミット・プッシュ・PR 作成はユーザー自身が行う前提とし、AI は手順案内のみ行う。

## やらないこと

- ユーザーから求められる前に、実装コードを丸ごと書いて渡すこと
- 承認なしに次のステップへ進めること
- 複数 Issue を自動で連続処理すること
- ユーザーに代わってコミット・プッシュ・PR 作成を行うこと
