# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを追加 | `docs/issue-402/00`〜`07` |
| 2 | 切断後も保存が完了するよう修正し、再現テストを追加 | `backend/app/core/shielded.py`、`backend/app/services/llm_chat_service.py`、`backend/app/services/message_service.py`、`backend/tests/unit/asgi_disconnect.py`、`backend/tests/unit/test_llm_chat_service.py`、`backend/tests/unit/test_message_service.py` |
| 3 | 動作確認結果を追記 | `docs/issue-402/08_動作確認.md` |
| 4 | code-review.md を追加 | `docs/issue-402/code-review.md` |

## 各コミットメッセージ案

- `#402 issue-402 設計ドキュメントを追加`
- `#402 issue-402 クライアント切断後も使用量・回答の保存が完了するようにする`
- `#402 issue-402 動作確認結果を追加`
- `#402 issue-402 code-review.md を追加`
