# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-156/` |
| 2 | feedback系APIのレスポンス構造をラッパー統一・ページング情報追加で修正 | `backend/app/schemas/feedback.py`, `backend/app/routers/feedback.py`, `backend/app/services/feedback_service.py`, `backend/tests/integration/test_feedback.py` |

## 各コミットメッセージ案

```
#156 issue-156 docs/issue-156 のドキュメント一式を作成
    - feedbackUserのfeedbacksラッパー欠落・totalPages不足の要件・設計・テスト方針を記録
```

```
#156 issue-156 feedback系APIのレスポンス構造を移植元と一致させる
    - feedbackUserにfeedbacksラッパーを追加し、feedbackMessage/feedbackRoomと構造を統一
    - feedback系3APIのページングにtotalPages・numberOfElementsを追加
    - 「回答数一覧」タブのTypeErrorクラッシュと、3タブ共通のページ送り不具合を解消
    - test_feedback.pyの既存アサーションを新レスポンス構造に更新し、ページング値の検証を追加
```
