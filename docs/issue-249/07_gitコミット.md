# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-249/00`〜`08` |
| 2 | 実装とテスト | `backend/app/models/ai_model.py`、`backend/app/core/llm_client.py`、`backend/app/repositories/assistant_endpoint_repository.py`、`backend/app/services/llm_chat_service.py`、`backend/app/services/message_service.py`、`backend/tests/unit/test_llm_client.py`、`backend/tests/unit/test_llm_chat_service.py`、`backend/tests/unit/test_message_service.py`、`backend/tests/integration/test_messages.py`、`backend/tests/integration/test_llm_chat.py` |
| 3 | code-review 結果 | `docs/issue-249/code-review.md`（指摘対応があればその修正も） |

## 各コミットメッセージ案

```
#249 issue-249 Bedrock対応の修正の設計ドキュメントを追加
    - docs/issue-249 に 00〜08 を作成
```

```
#249 issue-249 メッセージ送信でBedrockを使えるようにしmaxTokens切り詰めとtools検証を追加
    - アシスタントのチャット用エンドポイント解決をAzure OpenAI固定からBedrockを含むチャット用種別全般に広げた
    - メッセージ送信でエンドポイント種別に応じてBedrockクライアントを呼び、使用量に実際の種別を記録する
    - maxTokensをAIモデルの上限で切り詰める（Azure・Bedrock）
    - Bedrockでtoolsを指定した場合、ストリーミング開始前に400で拒否する
    - BedrockLlmChatClientのmax_tokens_fallbackを削除し、上限は呼び出し側で決める
```

```
#249 issue-249 code-review結果を追加
    - docs/issue-249/code-review.md を作成
```
