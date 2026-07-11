# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-93/` |
| 2 | メッセージ送信（アシスタント応答生成・SSEストリーミング）APIの実装 | `app/schemas/message.py`, `app/repositories/message_content_repository.py`, `app/repositories/assistant_endpoint_repository.py`, `app/services/message_service.py`, `app/routers/messages.py` |
| 3 | テスト追加 | `backend/tests/unit/test_message_service.py`, `backend/tests/integration/test_messages.py` |
| 4 | code-review指摘対応（必要な場合） | 指摘に応じたファイル |

## 各コミットメッセージ案

```
#93 issue-93 00_チケット内容.md を作成
```

```
#93 issue-93 メッセージ送信（アシスタント応答生成・SSEストリーミング）APIを実装
    - schemas/message.py に MessageContentHistoryTurn・MessageContentCreateRequest を追加
    - message_content_repository.py に save を追加
    - assistant_endpoint_repository.py に find_chat_endpoint を追加
    - message_service.py に stream_message_content を追加（SAAS_CHATのみ対応）
    - routers/messages.py に POST /api/messages/content を追加
```

```
#93 issue-93 メッセージ送信APIのテストを追加
    - test_message_service.py に分岐網羅の単体テストを追加
    - test_messages.py にSSE正常系・404・403の統合テストを追加
```
