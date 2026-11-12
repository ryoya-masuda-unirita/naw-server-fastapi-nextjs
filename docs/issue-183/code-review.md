# code-review 結果

`/code-review 220`（PR #220）の結果。🔴 致命的と判定された指摘はなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | 永続化で `ValueError`（再生成対象がストリーミング中に削除）が起きると、`message_content` も `error` も送らずに終わる | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/message_service.py` | `finally` 節の永続化で `ValueError` 以外の例外（DB 接続エラー等）が起きると、`error` を送らずに接続が切れる | 対応しない |
| 3 | 🟡 注意 | `backend/tests/integration/test_messages.py` | 編集・再送信テストの「同じ親を持つ」検証が `None == None` で必ず通る | 対応済み |
| 4 | 🔵 提案 | `backend/app/services/message_service.py` | `payload` に `type` キーがあると種別が上書きされる | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/message_service.py` | `error` イベントに `str(e)` をそのまま入れており、内部情報が見える | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/message_service.py` | 同名の `_sse` が `llm_chat_service.py` と別形式で 2 か所にある。`core` に集約できる | 対応しない |
| 7 | 🔵 提案 | `backend/tests/unit/test_message_service.py` | `_sse_events` が unit と integration に重複している | 対応しない |
| 8 | 🔵 提案 | `backend/tests/unit/test_message_service.py` | `_sse_events` の docstring は「frontend と同じ規則」だが、frontend が捨てる `error` も数えている | 対応済み |
| 9 | 🔵 提案 | （コミット履歴） | コミット「動作確認結果を記録（途中）」に変更詳細の行がない | 対応しない |

## 詳細

### 1. 永続化失敗時に何も送らずに終わる（🟡 注意）→ 対応済み

移植元 `streamAndPersist` は永続化時の例外を外側の `catch` で受けて `sendSseError` を送る。これに合わせ、`stream_finished` だが `content_response` が `None`（永続化に失敗）の場合は `{"type": "error", "message": "エラーが発生しました。"}` を送るようにした。内部の例外内容はログにのみ残す。単体テスト `test_emits_error_event_when_regenerate_target_deleted_during_stream`（開始時は存在し、永続化時の再取得で `None` になる競合）を追加し、`text_delta → message_stop → error` で終わることを確認した。

なお frontend-angular は `error` イベントを処理しないため、この経路では従来どおり「`message_content` なしで終了」の例外になる（移植元も同じ挙動）。再生成中に対象が削除される競合でのみ起き、編集・再送信（新しいメッセージへの新規生成）の経路では起きない。

### 2. 永続化中のその他の例外（🟡 注意）→ 対応しない

`finally` 節の永続化処理の例外の扱いは本 PR で変更しておらず、SSE の形式（本 Issue の原因）とは別の論点である。DB 接続エラーなどの障害時の挙動であり、移植元に合わせるには永続化処理全体の例外の扱いを見直す必要があるため、本 PR の範囲外とする。

### 3. 「同じ親」の検証が成立していない（🟡 注意）→ 対応済み

編集対象を、既存メッセージ A に続けて送ったメッセージ B（親が A）に変更した。B と同じ親 A で編集後のメッセージ B' を作成・送信し、B と B' の `parentId` がどちらも A であること（`None` ではない）を確認する形にした。各 API 呼び出しのステータスコードも確認するようにした。

### 4. `type` の上書き（🔵 提案）→ 対応済み

`_sse` で `{**payload, "type": event_type}` の順にし、`payload` に `type` キーが含まれていても種別が上書きされないようにした。

### 5. `error` イベントの `str(e)`（🔵 提案）→ 対応しない

LLM 呼び出し失敗時に例外メッセージを `error` イベントで送るのは issue-93 からの既存の挙動で、移植元も `sendSseError(emitter, e.getMessage())` で例外メッセージを送っている。本 PR では形式（`type` の付与）のみを変更し、内容は移植元と同じままとする。

### 6. `_sse` の重複（🔵 提案）→ 対応しない

LLM Chat API（`llm_chat_service.py`）は frontend-angular から呼ばれておらず、その SSE・リクエスト形式を移植元に合わせるかは本 Issue の範囲外（PR 本文の未確認事項に記載し、対応要否はユーザー判断とする）。形式を揃える際に `core` への集約を検討する。

### 7. テストヘルパーの重複（🔵 提案）→ 対応しない

unit と integration は別のテスト層で、既存のテストもヘルパーをファイルごとに持っている（`_request`・`_content_form` 等）。共通モジュールの新設は本 PR の範囲を超えるため見送る。

### 8. `_sse_events` の docstring（🔵 提案）→ 対応済み

「frontend と同じく `data:` 行の JSON の `type` で判定する。frontend は `error` を処理せず捨てるが、サーバーが送る内容を検証するため `type` を持つイベントをすべて返す」と実態に合わせて修正した（unit・integration の両方）。

### 9. 途中コミットのメッセージ（🔵 提案）→ 対応しない

指摘のとおり規約に沿っていない。ただし該当コミットは push 済みで、その後に origin/develop のマージコミットを含むため、履歴の書き換えは避ける。以後のコミットは規約どおりに書く。
