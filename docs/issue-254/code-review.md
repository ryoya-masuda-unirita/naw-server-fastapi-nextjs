# code-review 結果

PR #262 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | トークン使用量の保存だけが失敗すると error を送るが、回答（MessageContent）は別セッションで保存済み | 対応しない |
| 2 | 🟡 注意 | `backend/app/services/message_service.py` | ライブラリの保存が失敗すると error を送るが、回答は保存済み（移植元はライブラリ→回答の順） | 対応しない |
| 3 | 🟡 注意 | `backend/app/services/message_service.py` | 回答の保存後のルーム更新日時の更新で失敗しても「保存失敗」扱いになる | 対応しない |
| 4 | 🟡 注意 | `backend/app/services/message_service.py` | 根本原因は保存が 3 つのセッションに分かれアトミックでないこと。1 トランザクションにまとめるべき | 対応しない |
| 5 | 🟡 注意 | `backend/app/services/message_service.py`・`llm_chat_service.py` | `finally` の保存がキャンセル（`CancelledError`）から保護されておらず、切断時に保存が飛ばされうる | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/message_service.py` | LLM 失敗と保存失敗が重なると error が 2 回送られ、1 回目は例外文字列をそのまま返す | 対応しない |
| 7 | 🟡 注意 | `backend/app/services/llm_chat_service.py` | 汎用チャットのライブラリ保存失敗を通知しない根拠として移植元を挙げているが、移植元はライブラリを保存していない | 対応済み |
| 8 | 🔵 提案 | `backend/app/services/message_service.py` | `content_response is not None and not persist_failed` は冗長 | 対応しない |
| 9 | 🔵 提案 | `message_service.py`・`llm_chat_service.py` | 同じ try/except の形が 5 か所ある。ヘルパーにまとめられる | 対応しない |

🔴 致命的の指摘はなかった。

## 詳細

### 1〜4. 保存がアトミックでないことによる不整合（🟡 注意）→ 対応しない

移植元は回答・トークン使用量を同じトランザクション（REQUIRES_NEW）で保存するため、「error = 何も保存されていない」が成り立つ。こちらは #220 の設計で、回答（ルーム更新日時を含む）・ライブラリ・トークン使用量を別々のセッションで保存しているため、後段の保存だけが失敗すると、回答は残ったまま error を送ることがある。

本 Issue の目的は「保存処理の例外で error を送らずに接続が切れる」ことの修正で、イベント列は移植元（保存処理のどれかが失敗したら message_content を送らず error だけ送る）に合わせた。保存を 1 つのトランザクションにまとめる変更は、保存処理の作り（#220 の設計）を変える大きな修正になる。並行して `message_service.py` を変更している #249 と衝突しやすいため、本 PR では行わない。必要であれば別 Issue で扱う（メインのセッションの判断に委ねる）。

なお指摘 3 は、修正前は例外が捕捉されず接続が切れていたケースで、今回の変更で「error を送って閉じる」に改善している。

### 5. キャンセル時に保存が飛ばされうる（🟡 注意）→ 対応しない

`finally` の保存を `anyio.CancelScope(shield=True)` で保護していない点は、本 PR より前からある挙動（#220 から同じ）で、本 Issue（error イベントを送らない問題）の範囲外。`except Exception` で `CancelledError` を捕まえないこと自体は意図どおり（キャンセルの伝播を妨げない）。保護が必要かは、使っている Starlette・uvicorn の切断検知の方式を確認したうえで別 Issue で判断するのがよい。

### 6. error が 2 回送られ、1 回目は例外文字列を返す（🔵 提案）→ 対応しない

移植元も同じ挙動。内側の catch（LLM 失敗）で `e.getMessage()` を返し、そこでの `persistMessageContent` が失敗すると一番外側の catch でもう一度 `sendSseError` を送る。LLM 失敗時の文言は本 Issue の範囲外（`01_要件定義.md` のスコープ外）。

### 7. 汎用チャットのライブラリ保存失敗のコメントの根拠（🟡 注意）→ 対応済み

移植元の最新の `LlmChatService` は、このAPIでライブラリを保存しない（local-server 側で登録する）。コメントを書き直し、トークン使用量の扱いは移植元に合わせたこと、ライブラリの扱いには移植元の根拠がなく、トークン使用量と同じくログのみにしたことを明記した。汎用チャットでライブラリを保存すること自体が移植元と違う点は、PR 本文の「スコープ外として気づいた点」に記載した。

### 8. 条件の冗長さ（🔵 提案）→ 対応しない

`content_response is not None` は mypy の型の絞り込み（`model_dump` 呼び出しのため）に必要。代わりに `assert` を使う方法は、`-O` 実行で無効になるため、このファイルの既存方針（`stream_message_content` 内のコメント参照）に合わない。

### 9. try/except の重複（🔵 提案）→ 対応しない

ヘルパーにまとめると、並行作業（#245・#249）と衝突しやすい `message_service.py` の差分が大きくなる。また `message_service` と `llm_chat_service` で共有するには `core/` に置く必要があり、本 Issue の範囲を超える。各ブロックは短く、失敗時の扱い（フラグを立てるか、ログのみか）もサービスごとに違うため、現状のままとする。
