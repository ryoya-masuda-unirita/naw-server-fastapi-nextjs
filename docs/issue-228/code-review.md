# code-review 結果

PR #235 に対して `/code-review` を実行した結果。致命的なバグ（🔴）は無し。ハンドラのヘッダー維持・204/304 の本文なし・404/405 の変換・CORS との順序は問題なしとの評価。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/core/errors.py` | 想定外の例外（`ValueError` 等）が今も 500 の text/plain で、`{timestamp, message}` にならない | 対応しない |
| 2 | 🟡 注意 | `backend/tests/integration/test_auth.py` ほか | 422 → 400 の一括置換で、ステータスだけでは入力エラーと業務エラーの 400 を区別できないテストがある | 対応済み |
| 3 | 🟡 注意 | `backend/app/core/errors.py` | 入力エラーの `message` が Pydantic 標準の英語文言で、どの項目か分からない | 対応しない |
| 4 | 🔵 提案 | `backend/app/main.py` | OpenAPI が全エンドポイントで 422 の `HTTPValidationError` を宣言したまま | 対応しない |
| 5 | 🔵 提案 | `backend/app/core/errors.py` | `detail` が文字列以外のとき `str()` だと Python の repr になる | 対応しない |
| 6 | 🔵 提案 | `backend/app/core/errors.py` | 接頭辞を外すのが `value_error` だけで、`assert` による独自チェックでは `Assertion failed, ` が残る | 対応しない |
| 7 | 🔵 提案 | `backend/tests/unit/test_errors.py` | 「最初の 1 件だけ返す」テストが接頭辞除去のテストとほぼ同じ入力で、連結しないことの検証として弱い | 対応済み |
| 8 | 🔵 提案 | `backend/app/core/errors.py` | 移植元は `ResponseStatusException` を毎回 `log.error` に出すが、`HTTPException` のハンドラはログを出さない | 対応しない |

## 詳細

### 1. 想定外の例外が `{timestamp, message}` にならない（🟡 注意）→ 対応しない

- 本 Issue の対象は、ユーザー判断で `HTTPException`・`RequestValidationError`（Pydantic の検証エラー、依存関数内のものを含む）に絞っている（01 のスコープ外に記載済み）
- 指摘の例のうち、パスワード生成のポリシー不正（`user_service.py`）は移植元 `PasswordGenerator` では `IllegalStateException`（500）。`ValueError` を一律 400（`IllegalArgumentException` 相当）にすると、移植元と逆にずれる。backend の `ValueError` は移植元の `IllegalArgumentException`（400）と `IllegalStateException`（500）の両方に相当するため、型だけで一律に対応付けられない
- 移植元でも、ハンドラが無い例外は `ErrorResponse` ではなく Spring Boot 既定の応答（`message` なし）になる
- FastAPI では `Exception` のハンドラは CORS ミドルウェアの外側で動くため、ハンドラを足してもブラウザ（別オリジンの frontend）からは本文を読めず、効果が小さい
- LLM 呼び出しの `ValueError`（`llm_client.py` の `_to_anthropic_content`）は `stream_chat` の中で送出され、`LlmChatService` の `event_stream()` の `except Exception` で捕捉されて SSE のエラーイベントになる。HTTP のエラー応答にはならず、本 Issue の対象外（SSE の形式は変えない）

### 2. ステータスだけでは入力エラーか業務エラーか区別できない（🟡 注意）→ 対応済み

同じエンドポイントに業務エラーの 400 もあり、取り違えやすい次の 5 件に `message` の確認を追加した。テストの意図（入力エラー）は変えていない。

- `test_auth.py::test_post_auth_password_reset_without_login_id` → `"Field required"`
- `test_messages.py::test_returns_400_when_neither_message_id_nor_content_id_given` → 「messageId または messageContentId のいずれかを指定してください」
- `test_messages.py::test_returns_400_when_text_data_is_missing` → `"Field required"`
- `test_rooms.py::test_get_rooms_returns_400_when_page_is_negative` / `..._size_is_out_of_range` → Pydantic の範囲のメッセージ

それ以外の入力エラーのテスト（文字数上限・必須など、スキーマの宣言だけで弾くもの）は、変更前もステータスだけを確かめていたもので、本 PR ではステータスの確認のままとした（422 だった頃と検証の強さは同じで、弱めてはいない。ただし 400 は業務エラーとも重なるため、今後テストを触る際は `message` まで確かめるのが望ましい）。

### 3. 入力エラーのメッセージが英語の既定文言（🟡 注意）→ 対応しない

01 のスコープ外に記載済み。本 Issue は形・ステータス・組み立て方（最初の 1 件）を揃えるもので、項目ごとの日本語文言を移植元（`@Size(message=...)` 等）に揃えるのは、全スキーマに独自メッセージを足す別の作業になる。独自チェックで日本語メッセージを指定している項目は、既にそのまま返る（`test_library_tags.py` で確認）。

### 4. OpenAPI の 422 定義（🔵 提案）→ 対応しない

01 のスコープ外に記載済み。OpenAPI はクライアントの型生成・CI に使っておらず、全ルーターの `responses` を書き換える必要があるため。

### 5. 文字列以外の `detail` が repr になる（🔵 提案）→ 対応しない

app 内の `HTTPException` は全て文字列の `detail` で、規約（`backend/.claude/CLAUDE.md`）にも「`detail` には文字列を渡す」と追記した。存在しないケースのための変換は足さず、500 にしないための保険としての `str()` に留める。

### 6. `assert` による独自チェックの接頭辞（🔵 提案）→ 対応しない

backend のスキーマに `assert` による独自チェックは無く、規約（`backend/.claude/CLAUDE.md` の「バリデーション」）の例も `ValueError` を送出する書き方になっている。存在しない書き方のための分岐は足さない。

### 7. 「最初の 1 件だけ」のテストが弱い（🔵 提案）→ 対応済み

入力を `{"count": "x"}`（`name` の必須なし・`count` の型違いの 2 件）に変え、`message` が 1 件目の `"Field required"` だけであることを確かめる形にした。接頭辞除去のテストとは入力・期待値とも別になった。

### 8. 業務エラーのログ（🔵 提案）→ 対応しない

変更前（FastAPI 標準）も業務エラーはログに出しておらず、本 Issue で挙動は変えていない。401・403・404 など頻発するものを毎回出すとログが増えるため、必要になった時点で別途検討する。入力エラーは応答に最初の 1 件しか載らないため、全件の位置と種類を WARNING で出している。
