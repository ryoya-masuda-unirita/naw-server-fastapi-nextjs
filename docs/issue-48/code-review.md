# code-review 結果

`/code-review`（medium effort）を実行し、8角度の指摘候補を検証したうえで、確度の高い4件を採用した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | ルーム所有権チェックが3箇所で微妙に異なる実装になっており、エラーコードが不統一だった（`_require_can_write_room`は404/403を区別せず常に403、他は404→403に分岐） | 対応済み |
| 2 | 🟡 注意 | `backend/app/models/message.py` | `MessageContent.status`・`MessageFeedback.rating`がPostgresのネイティブEnum型でなく素のVARCHARにマッピングされており、他モデル（`Assistant.type`等）の慣例から外れていた | 対応済み |
| 3 | 🔵 提案 | `backend/app/repositories/message_repository.py` | `MessageRepository.create`が未使用のデッドコードだった（実際の作成処理は`message_service.py`内でRoom更新と合わせて1トランザクションにする必要があり、直接`session.add`している） | 対応済み |
| 4 | 🔵 提案 | `backend/app/services/message_service.py` 他 | 新規追加した関数のdocstringが日本語1行のみで、`backend/.claude/CLAUDE.md`の「Google スタイルで書く。引数・戻り値・例外がある関数には必ず記載すること」に従っていなかった | 対応済み |

## 詳細

### 1. ルーム所有権チェックの不統一（🟡 注意）→ 対応済み

`_require_can_write_room`（旧実装）は「ルームが存在しない」場合と「存在するが所有者でない」場合を区別せず、常に403を返していた。一方`get_messages_and_assistants`・`get_message_contents`は同じ状況を404/403に分けて返していた。同一API群内でエラーコードの意味が揺れていたため、`_require_owned_room`という1つのヘルパーに統一し、「存在しなければ404、権限がなければ403」という一貫した規則にした（移植元の`RoomAccessService`の`requireCanAccessRoom`/`requireCanWriteRoom`と同じ使い分け）。`create_message`・`get_messages_and_assistants`・`delete_message`・`delete_message_by_content_id`・`feedback_message`すべてがこのヘルパーを使うよう統一。

これに伴い、`test_create_message_with_other_users_room_returns_404`が実際には403を返すべきテストだったため、`test_create_message_with_other_users_room_returns_403`に修正した（他人のルームは「存在するが権限がない」ケースであり、404ではなく403が正しい）。

`delete_message`・`delete_message_by_content_id`はロジックがほぼ同一だったため、`_delete_message_if_found`という共通ヘルパーに統合した。

### 2. status/ratingが素のVARCHAR（🟡 注意）→ 対応済み

`alembic/versions/012_add_messages.py`と`app/models/message.py`を修正し、`message_contents.status`・`message_feedbacks.rating`をPostgresのネイティブEnum型（`messagecontentstatus`・`messagerating`）に変更した。これにより、想定外の文字列がDBレベルで拒否されるようになる。ローカル環境で`alembic downgrade 011`→`alembic upgrade head`を再実行し、enum型が正しく作成されること、および`curl`でのフィードバック登録・メッセージ内容取得が正常に動作することを確認した。

### 3. MessageRepository.createのデッドコード（🔵 提案）→ 対応済み

未使用だったため削除した。

### 4. docstring不足（🔵 提案）→ 対応済み

`message_service.py`・`message_repository.py`・`message_content_repository.py`・`message_feedback_repository.py`・`room_repository.py`の新規関数に、Args/Returns/Raisesを含むGoogle スタイルのdocstringを追加した。
