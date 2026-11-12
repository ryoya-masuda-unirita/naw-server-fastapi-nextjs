# code-review 結果

`/code-review 207`（PR #207）の結果。対象は `backend/app`・`backend/tests` の差分。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/routers/messages.py` | multipart の解析・添付の読み込み・検証が認証の依存より先に評価される | 対応済み |
| 2 | 🟡 注意 | `backend/app/schemas/message.py` | `textData` を `errors="replace"` でデコードしており、不正な UTF-8 が文字化けしたまま通る | 対応済み |
| 3 | 🟡 注意 | `backend/app/schemas/message.py` | 422 の `loc` の形が揃っていない。モデル単位のエラーの `input` に添付を含むリクエスト全体が入る | 対応済み |
| 4 | 🔵 提案 | `backend/app/schemas/message.py` | `json.loads` → dict 判定 → 独自エラーの手書きを pydantic の JSON 検証にまとめられる | 対応済み |
| 5 | 🟡 注意 | `backend/tests/integration/test_messages.py` | 新規テストヘルパーの型ヒント・docstring（Args/Returns）が規約に沿っていない | 対応済み |
| 6 | 🟡 注意 | `backend/app/schemas/message.py` | 添付ファイルを Base64 エンコード→検証時にデコードしており、一時的にメモリを余分に使う。サイズ上限がない | 対応しない |
| 7 | 🔵 提案 | `backend/app/schemas/message.py` | `textData` 内の `attachmentFiles` がファイルパートで黙って上書きされる | 対応しない |
| 8 | 🔵 提案 | `backend/app/schemas/message.py` | ファイル名なしのパートは `name` の最小長で 422 になる | 対応しない |
| 9 | 🔵 提案 | `backend/app/schemas/message.py` | 会話履歴の `type` を大文字・小文字を区別せず受け付けており移植元より緩い | 対応しない |
| 10 | 🔵 提案 | `backend/tests/integration/test_messages.py` | 既存の送信テストにも `_patched_llm` を使える | 対応しない |

## 詳細

### 1. 認証より先に multipart の解析が走る（🔴 致命的）→ 対応済み

FastAPI は依存を宣言順に評価するため、`req`（`parse_message_content_create_form`）が先頭にあると、未認証のリクエストでも添付ファイルの読み込み・検証が走り、`textData` が壊れていれば 401 ではなく 422 を返していた。`req` を `get_verified_tenant_id`・`get_current_user` の後ろへ移動し、理由をコメントで残した。

テスト `test_returns_401_before_parsing_text_data_when_unauthenticated`（トークンなし＋壊れた `textData` → 401）を追加。旧順序に一時的に戻すと `assert 422 == 401` で失敗し、修正後は通ることを確認した。

### 2. 不正な UTF-8 の握り潰し（🟡 注意）→ 対応済み

`decode(errors="replace")` をやめ、`textData` のバイト列を pydantic の JSON 検証（`TypeAdapter(dict[str, Any]).validate_json`）にそのまま渡すようにした。不正な UTF-8 は `json_invalid` として 422 になる。テスト `test_returns_422_when_text_data_is_not_utf8`（Shift_JIS の `textData` → 422）を追加。

### 3. 422 の `loc` 不揃い・`input` の肥大化（🟡 注意）→ 対応済み

`_to_request_validation_error` を追加し、すべてのエラーの `loc` を `("body", "textData", ...)` に揃え、`input` を含めないようにした。`test_returns_422_when_text_data_is_not_object` で `loc == ["body", "textData"]` を確認している。

### 4. JSON 判定の手書き（🔵 提案）→ 対応済み

2 と同じ変更で `json.loads`・`isinstance(dict)`・`_text_data_error` を削除し、JSON の解釈と `MessageContentCreateRequest` の検証の `ValidationError` を 1 か所でまとめて変換するようにした。

### 5. テストヘルパーの型ヒント・docstring（🟡 注意）→ 対応済み

`_content_form`・`_patched_llm`（`engine: AsyncEngine`、内部の `_stream_chunks` も含む）・`_last_visible_message_id` に型ヒントと Google スタイルの Args/Returns（Yields）を追加した。

### 6. 添付の Base64 往復とサイズ上限（🟡 注意）→ 対応しない

`AttachmentFile.data` は `Base64Bytes` 型で、LLM Chat API・既存の添付処理と共有している。往復による余分なメモリは添付の約 1.33 倍の一時的なもので、frontend-angular が送る添付（画像・PDF・Office 文書）の規模では問題にならないと判断した。`model_construct` で検証を迂回すると名前・種別の検証も外れるため採らない。アップロードサイズの上限は本 Issue（送信形式の不一致）とは別の論点であり、既存の JSON 形式でも上限はなかったため、スコープ外とする。

### 7. `textData` 内の添付キーの上書き（🔵 提案）→ 対応しない

移植元の `CreateMessageContentRequest` には `attachmentFiles` フィールドがなく、`textData` に入れても無視される（添付はファイルパートからのみ受け取る）。本実装も添付はファイルパートからのみ受け取る点で移植元と同じ挙動であり、明示的に拒否する必要はないと判断した。旧 JSON 形式のクライアントは存在しない（`frontend/` も本 API を呼んでいない）。

### 8. ファイル名なしのパート（🔵 提案）→ 対応しない

Starlette は `filename` 指定のないパートを `UploadFile` ではなく文字列として扱う（`attachmentFiles` の型検証で 422 になる）。空名の `UploadFile` になるのは `filename=""` を明示したパートだけだが、ブラウザの `FormData` は File/Blob に必ず名前を付ける（Blob は `blob`）ため、実際のクライアントからは届かない。そのようなパートを 422 とするのは妥当と判断した。

### 9. 発話種別の大文字・小文字（🔵 提案）→ 対応しない

サービス層・既存テストは属性名 `role` に小文字（`user` 等）で値を入れて生成しており、大文字のみに限定するとそれらが通らなくなる。小文字を受け付けても LLM へ渡す値は同じであり、不正な値（列挙値以外）は拒否しているため、厳密化の利点は小さいと判断した。

### 10. 既存テストへの `_patched_llm` 適用（🔵 提案）→ 対応しない

本 PR で既存テストに加えた変更は送信形式（JSON → multipart）の置き換えに留め、モックの組み方まで書き換える差分は入れない（レビュー範囲を本 Issue の変更に絞るため）。

## マージ後の追加対応（feature/issue-182-followup）

PR #207 のマージ後、CI の mypy チェック（`uv run mypy app tests`）が失敗していた。

- `tests/integration/test_messages.py`: テストヘルパー `_patched_llm` で同期版 `sessionmaker` に `AsyncEngine` を渡しており、型定義に合わず `call-overload` エラーになっていた。本番の `get_session_maker` と同じ `async_sessionmaker` に変更した。
- `tests/integration/test_library_repository.py`（Issue #173 由来、同じ CI ジョブを失敗させていたため併せて修正）: `LibraryTagMapping.__table__`（SQLModel の型定義に現れない）をマッパー経由の列取得に、`visitors.iterate` へ渡す文を `ExternallyTraversible` として明示した。テストの挙動は変えていない。

確認結果:

```
$ uv run mypy app tests
Success: no issues found in 205 source files

$ uv run pytest -p no:cacheprovider -q
850 passed, 1082 warnings in 41.13s
```
