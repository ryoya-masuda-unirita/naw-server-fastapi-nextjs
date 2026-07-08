# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | フィードバックメッセージ取得APIのスキーマとリポジトリを追加 | `app/schemas/feedback.py`、`app/repositories/message_feedback_repository.py` |
| 2 | フィードバックメッセージ取得APIを実装 | `app/services/feedback_service.py`、`app/routers/feedback.py` |
| 3 | フィードバックメッセージ取得APIのテストを追加 | `tests/integration/test_feedback.py` |
| 4 | 動作確認とドキュメントを更新 | `docs/issue-54/06_タスクリスト.md`、`docs/issue-54/08_動作確認.md`、`docs/issue-54/code-review.md` |

## 各コミットメッセージ案

```
#54 issue-54 フィードバックメッセージ取得APIのスキーマとリポジトリを追加
    - schemas/feedback.pyにfeedbackMessage用のリクエスト・レスポンススキーマを追加
    - message_feedback_repository.pyに一覧取得クエリを追加
```

```
#54 issue-54 フィードバックメッセージ取得APIを実装
    - services/feedback_service.pyにassistantNameとassistantIdToServerMapの整形を追加
    - routers/feedback.pyにGET /api/admin/feedbackMessageを追加
```

```
#54 issue-54 フィードバックメッセージ取得APIのテストを追加
    - test_feedback.pyに一覧・絞り込み・ソート・権限のテストを追加
```

```
#54 issue-54 動作確認とドキュメントを更新
    - タスクリストと動作確認を更新
    - code-review結果を記録
```
