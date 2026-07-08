# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `messages`/`message_contents`/`message_files`/`message_feedbacks` テーブルとモデルを追加 | `alembic/versions/012_add_messages.py`、`app/models/message.py` |
| 2 | メッセージ関連APIのスキーマとリポジトリを追加 | `app/schemas/message.py`、`app/repositories/message_repository.py`、`app/repositories/message_content_repository.py`、`app/repositories/message_feedback_repository.py` |
| 3 | メッセージ送受信API（作成・一覧・内容取得・削除・フィードバック）を実装 | `app/services/message_service.py`、`app/routers/messages.py`、`app/main.py` |
| 4 | メッセージ送受信APIのテストを追加 | `tests/integration/test_messages.py` |
| 5 | `06_タスクリスト.md`・`08_動作確認.md` を更新 | `docs/issue-48/06_タスクリスト.md`、`docs/issue-48/08_動作確認.md` |

（code-reviewの指摘対応が発生した場合は別途コミットを追加する）

## 各コミットメッセージ案

```
#48 issue-48 messages・message_contents・message_files・message_feedbacksテーブルとモデルを追加
    - alembicマイグレーション012で4テーブルを作成
    - SQLModelでMessage・MessageContent・MessageFile・MessageFeedbackを定義
```

```
#48 issue-48 メッセージ関連APIのスキーマとリポジトリを追加
    - schemas/message.pyに作成・一覧・内容取得・フィードバックのリクエスト/レスポンススキーマを追加
    - repositories/にメッセージ・メッセージ内容・メッセージフィードバックのDBアクセスを追加
```

```
#48 issue-48 メッセージ送受信API（同期系）を実装
    - services/message_service.pyにルーム所有権チェックを含むビジネスロジックを実装
    - routers/messages.pyに作成・一覧・内容取得・削除・フィードバックのエンドポイントを追加
    - main.pyにルーターを登録
```

```
#48 issue-48 メッセージ送受信APIのテストを追加
    - test_messages.pyに正常系・異常系・テナント分離・権限チェックのテストを追加
```

```
#48 issue-48 06_タスクリスト・08_動作確認.mdを更新
    - 実装・テストタスクを完了に更新
    - 動作確認結果を記録
```
