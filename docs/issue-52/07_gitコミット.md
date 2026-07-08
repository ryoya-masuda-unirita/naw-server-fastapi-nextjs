# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | フィードバックユーザー一覧APIのスキーマとリポジトリを追加 | `app/schemas/feedback.py`、`app/repositories/message_feedback_repository.py` |
| 2 | フィードバックユーザー一覧取得APIを実装 | `app/services/feedback_service.py`、`app/routers/feedback.py`、`app/main.py` |
| 3 | フィードバックユーザー一覧取得APIのテストを追加 | `tests/integration/test_feedback.py` |
| 4 | `06_タスクリスト.md`・`08_動作確認.md` を更新 | `docs/issue-52/06_タスクリスト.md`、`docs/issue-52/08_動作確認.md` |

（code-reviewの指摘対応が発生した場合は別途コミットを追加する）

## 各コミットメッセージ案

```
#52 issue-52 フィードバックユーザー一覧APIのスキーマとリポジトリを追加
    - schemas/feedback.pyにリクエスト・レスポンススキーマを追加
    - message_feedback_repository.pyにusers/message_feedbacks/roomsを集計するfind_feedback_usersを追加
```

```
#52 issue-52 フィードバックユーザー一覧取得APIを実装
    - services/feedback_service.pyにsortFieldマッピング等のロジックを実装
    - routers/feedback.pyにGET /api/admin/feedbackUserを追加
    - main.pyにルーターを登録
```

```
#52 issue-52 フィードバックユーザー一覧取得APIのテストを追加
    - test_feedback.pyに集計・絞り込み・ソート・ページング・権限・テナント分離のテストを追加
```

```
#52 issue-52 06_タスクリスト・08_動作確認.mdを更新
    - 実装・テストタスクを完了に更新
    - 動作確認結果を記録
```
