# code-review 結果

PR #231 に対して `/code-review` を実行した。指摘は 10 件（🔴 致命的 0 件）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/schemas/llm.py` | `content` が空文字だと 422 になる（移植元は空文字を受け付けるため、画像だけの発話が送れない） | 対応しない |
| 2 | 🟡 注意 | `backend/app/services/llm_chat_service.py` | `role` を trim せずに判定しているため、`"user "` の発話の添付ファイルがエラーにならずに捨てられる | 対応済み |
| 3 | 🔵 提案 | `backend/app/schemas/multipart_form.py` | ファイル名のない空ファイルが 422 になる（移植元は空ファイルを無視し、名前のない非空ファイルは 400） | 対応しない |
| 4 | 🟡 注意 | `backend/app/schemas/llm.py` | `"attachments": null` が 422 になる（移植元は添付なしとして扱う） | 対応済み |
| 5 | 🔵 提案 | `backend/app/routers/llm.py` | 「認証の依存より後に置けば添付ファイルの読み込みが走らない」というコメントが不正確（multipart 本体の受信は依存の評価前に行われる） | 対応済み |
| 6 | 🔵 提案 | `backend/app/schemas/multipart_form.py` | 添付ファイルパート由来の検証エラーも `loc` が `["body", "textData", ...]` になる | 対応しない |
| 7 | 🔵 提案 | `backend/app/schemas/llm.py` | `populate_by_name=True` により、旧項目名 `responseFormat` も受け付けてしまう | 対応しない |
| 8 | 🔵 提案 | `backend/app/services/llm_chat_service.py` | 同名ファイルは検証で拒否済みのため、「同名は先勝ち」の処理は不要 | 対応済み |
| 9 | 🔵 提案 | `backend/app/schemas/multipart_form.py` | アップロードしたバイト列を Base64 にエンコードし、直後にデコードしている（メモリ・CPU の無駄） | 対応しない |
| 10 | 🔵 提案 | `backend/app/services/llm_chat_service.py` | `content` が `str` である前提を `assert` で確認しており、`python -O` では検証が消える | 対応しない |

## 詳細

### 1. `content` の空文字（🟡 注意）→ 対応しない

`01_要件定義.md` のスコープ外に記載済みの差異。空文字を許可すると、Azure では画像だけの発話が送れるようになるが、Bedrock（Anthropic Messages API）は空のテキストブロックを受け付けないため、Bedrock 経路では LLM 呼び出しエラーになる。正しく揃えるには Bedrock 用の変換（空のテキストパートを除く等）も変える必要があり、リクエスト形式・SSE 形式を揃える本 Issue の範囲を超えるため、別途検討とする。

### 2. `role` の trim（🟡 注意）→ 対応済み

移植元 `buildSpringAiMessages` と同じく、`role.strip().lower()` で user 発話を判定するように修正した。テスト `TestApplyAttachmentFiles.test_trims_role_when_judging_user_turn` を追加した。未対応の role を 400 にする検証は、`01_要件定義.md` のとおりスコープ外のまま。

### 3. ファイル名のない添付ファイル（🔵 提案）→ 対応しない

送信 API（#182）と共通の処理であり、入力エラーのステータスコード（422 / 400）は別途検討中のため、本 Issue では変えない（Issue の指示）。ファイル名なしのパートを送るクライアントは確認されていない。

### 4. `attachments: null`（🟡 注意）→ 対応済み

`LlmChatTurn` に `mode="before"` の `field_validator` を追加し、`null` を空の一覧として扱うようにした。テスト `TestLlmChatRequest.test_treats_null_attachments_as_empty` を追加した。

### 5. 認証より後に置く理由のコメント（🔵 提案）→ 対応済み

「防げるのは `textData` の解釈と添付ファイルの変換・検証であり、multipart 本体の受信自体は防げない」と正確に書き直した。同じコメントを持つ送信 API のルーター（`backend/app/routers/messages.py`）も同じ内容に揃えた（コメントのみの変更）。アップロードサイズの上限は本 Issue の範囲外。

### 6. 検証エラーの `loc`（🔵 提案）→ 対応しない

#182 で作った送信 API と同じ形式であり、エラー応答の形式は別途検討中のため、本 Issue では変えない（Issue の指示）。

### 7. `responseFormat` も受け付ける（🔵 提案）→ 対応しない

送信 API の `MessageContentCreateRequest`（#182）と同じ方針で、サービス層・既存テストが属性名で生成するために許可している。移植元の項目名 `response_format` は正しく受け付けており、受け口が広いだけで移植元の形式で送るクライアントへの影響はない。本 API を呼ぶクライアントは本リポジトリにない。

### 8. 「同名は先勝ち」の処理（🔵 提案）→ 対応済み

`setdefault` のループを、空ファイルを除く辞書内包表記に置き換え、docstring の「同名は先勝ち」を「同名ファイルは `LlmChatRequest` の検証で拒否済み」に修正した。

### 9. Base64 のエンコードとデコード（🔵 提案）→ 対応しない

#182 で作った送信 API と共通の処理で、`AttachmentFile`（`Base64Bytes`）の型を変える必要があり、本 Issue の範囲を超える。大きな添付ファイルでのメモリ使用量が問題になった時点で、両 API まとめて見直す。

### 10. `assert` による前提確認（🔵 提案）→ 対応しない

修正前の実装・送信 API（`message_service.py`）と同じ書き方で、mypy の型の絞り込みのために置いている。このメソッドより前に `content` をマルチモーダル化する処理はなく、本番で `-O` は使っていない。
