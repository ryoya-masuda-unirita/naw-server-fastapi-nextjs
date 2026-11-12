# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-254/00`〜`08` |
| 2 | 保存処理の例外処理とテスト | `backend/app/services/message_service.py`・`backend/app/services/llm_chat_service.py`・`backend/tests/unit/test_message_service.py`・`backend/tests/unit/test_llm_chat_service.py` |
| 3 | code-review の結果 | `docs/issue-254/code-review.md` |

## 各コミットメッセージ案

```
#254 issue-254 保存処理の例外でもSSEを正しく終える設計ドキュメントを追加
    - docs/issue-254 に 00〜08 を追加
```

```
#254 issue-254 メッセージ送信のSSEで保存処理の例外でもerrorイベントを送る
    - message_service: 回答・ライブラリ・トークン使用量の保存の例外を捕捉し、失敗時はmessage_contentの代わりに固定文言のerrorイベントを送る
    - llm_chat_service: 保存の例外を捕捉してログに残し、ストリームを正常に閉じる（移植元どおりクライアントへは通知しない）
    - 保存処理で例外を起こす単体テストを追加
```

```
#254 issue-254 code-review の結果を追加
    - docs/issue-254/code-review.md を追加
```
