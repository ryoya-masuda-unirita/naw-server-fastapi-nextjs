# code-review 結果

PR #256 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | SAAS_RAG で本文が空文字だと、空文字を埋め込みAPIに送って 400 になる | 対応しない（移植元と同じ挙動。別 Issue で検討） |
| 2 | 🟡 注意 | `backend/app/schemas/message.py` | 履歴の発話 `content` に `min_length=1` が残っており、空文字で保存した質問を履歴として送ると 400 になる | 対応しない（Issue の範囲外。移植元クライアントは空のターンを履歴に入れない） |
| 3 | 🟡 注意 | `backend/app/core/attachment_media.py` | 本文が空文字＋添付のとき、空のテキストパートを Azure に送る | 対応しない（移植元と同じ形で送っている） |
| 4 | 🟡 注意 | `backend/app/schemas/message.py` | 本文が空文字で添付もないリクエストも受け付ける | 対応しない（移植元と同じ挙動） |
| 5 | 🟡 注意 | `backend/app/schemas/message.py` | `historyAttachmentFiles`・`attachmentsCount` が app 内で使われなくなったのに残っている | 対応しない（移植元の API 項目として残す） |
| 6 | 🔵 提案 | `backend/tests/integration/test_messages.py` | 新しいテストが `_patched_llm` と同じ差し替えを重複して書いている | 対応済み |
| 7 | 🔵 提案 | `backend/tests/unit/test_message_service.py` | 件数一致・不一致の単体テストが実質同じ確認になっている | 対応済み |
| 8 | 🔵 提案 | `docs/issue-245/05_テスト詳細設計.md` | 「キーワード引数 `messages` を記録」と書いているが、実際は位置引数で呼ばれている | 対応済み |

🔴 致命的の指摘はなし。

## 詳細

### 1. SAAS_RAG で本文が空文字だと埋め込みに失敗する（🟡 注意）→ 対応しない

移植元も `MessageService.buildRagContext` で `vectorStore.similaritySearch(vm.userInput())` を本文が空文字のまま呼んでおり、空文字で埋め込みを作ろうとする点は同じ。本 Issue は「移植元で効いていない入力チェックを外す」ことが目的で、RAG 検索を省略するのは移植元にない挙動の追加になるため、この PR では変えない。画像だけの送信を RAG アシスタントで成り立たせるかは仕様判断が必要なので、PR 本文と最終報告で別 Issue での検討を提案する。

### 2. 履歴の発話 `content` の `min_length=1`（🟡 注意）→ 対応しない

移植元 `CreateMessageContentRequest.HistoryMessageContent.content` には制約がなく、移植先のほうが厳しいのは事実。ただし移植元クライアント（`message-history.helpers.ts` の `isCompleteTurn`）は質問・回答が空（`trim()` 後）のターンを履歴に入れないため、移植元クライアントの送り方ではこの 400 は起きない。Issue の対応範囲（履歴添付件数チェックの削除・`userInput` の空文字許可）の外なので、この PR では変えない。React でチャット履歴の送信を移植するときに、移植元クライアントと同じく空のターンを除外する必要がある。

### 3. 空のテキストパートを Azure に送る（🟡 注意）→ 対応しない

移植元 `PromptUserSpecService.createUserMessage` も `UserMessage.builder().text(userInput).media(...)` で空文字の本文と画像を送っており、送る形は同じ。移植元にない加工（空のテキストパートを落とす）を入れる根拠がないため変えない。実際の Azure での応答は未確認であることを `08_動作確認.md` の未確認事項に書いた。

### 4. 本文が空文字で添付もないリクエストを受け付ける（🟡 注意）→ 対応しない

移植元のサーバーも `@NotNull` だけで、本文も添付もない送信を拒否しない（送信ボタンの制御はクライアント側）。Issue の方針「必須なのは項目があることだけ」に合わせる。

### 5. 使われなくなった `historyAttachmentFiles`・`attachmentsCount`（🟡 注意）→ 対応しない

どちらも移植元のリクエスト項目（`MessageController.createMessageContent` の `@RequestPart historyAttachmentFiles`、`HistoryMessageContent.attachmentsCount`）で、移植元でも受け取るだけで LLM には使っていない。移植元クライアントは `attachmentsCount` を送ってくる。削除すると OpenAPI 上の API 定義が移植元とずれるため、受け付ける項目として残し、件数チェックを移植しない理由をフィールドのコメントに書いた（ルートの CLAUDE.md の「使われなくなったコードの削除」は、呼び出し元を失った関数などの内部コードが対象と判断した）。

### 6. `_patched_llm` との重複（🔵 提案）→ 対応済み

`_patched_llm` に、LLM に渡された会話履歴を記録する `sent_messages` 引数を追加し、新しいテストはそれを使うようにした。差し替え先（`stream_chat`・`get_session_maker`）の指定は 1 か所になった。

### 7. 件数一致・不一致の単体テストの重複（🔵 提案）→ 対応済み

件数チェックがなくなったため、件数が一致する場合のテスト `test_accepts_when_history_attachment_count_matches` は「件数チェックがある」前提の名前で、不一致のテストと同じことの確認になっていた。削除し、不一致のテストだけを残した。

### 8. テスト詳細設計の記述ずれ（🔵 提案）→ 対応済み

`05_テスト詳細設計.md` を、`_patched_llm` の `sent_messages` を使い、`inspect.signature(...).bind` で位置引数・キーワード引数のどちらでも `messages` を取り出すという実装どおりの記述に直した。
