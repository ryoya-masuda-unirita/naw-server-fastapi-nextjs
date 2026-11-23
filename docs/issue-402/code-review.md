# code-review 結果

PR #406 の差分（`backend/app/core/shielded.py`、`llm_chat_service.py`、`message_service.py`、テスト）を読んだ結果。🔴 致命的はなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/app/services/message_service.py` | `run_shielded` の import が、既存の `app.core` の import の並び（アルファベット順）から外れている | 対応済み |
| 2 | 🟡 注意 | `backend/app/core/shielded.py` | アプリ終了時に、実行中の保存タスクの完了を待つ仕組みがない | 対応しない |
| 3 | 🟡 注意 | `backend/app/services/message_service.py` | 切断でキャンセルされた場合、`message_content`・`error` イベントは送られない | 対応しない |

## 詳細

### 1. import の並び（🔵 提案）→ 対応済み

`app.core.shielded` を `app.core.sse` の直前（`room_access` の後）へ移した。

### 2. 終了時の保存タスクの扱い（🟡 注意）→ 対応しない

保存は 1 回の短い DB コミットで、切断後に動き続ける時間はごく短い。シャットダウンの待機処理を足すと、他の終了処理との順序など設計が広がるため、本 Issue の範囲では扱わない。`08_動作確認.md` の未確認事項に記載した。

### 3. キャンセル時にイベントを送らない（🟡 注意）→ 対応しない

切断済みのクライアントへは送れないため、`CancelledError` をそのまま伝播させるのが正しい。保存自体は別タスクで完了する。切断されていない通常の配信では、従来どおりイベントを送る（既存テストで確認済み）。
