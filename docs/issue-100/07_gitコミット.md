# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式(00〜08)の作成 | `docs/issue-100/*` |
| 2 | response_formatスキーマ追加とLlmChatRequest/MessageContentCreateRequestへの反映 | `backend/app/schemas/response_format.py`, `backend/app/schemas/llm.py`, `backend/app/schemas/message.py` |
| 3 | AzureLlmChatClient.stream_chatへのresponse_format反映と両サービスでの適用 | `backend/app/core/llm_client.py`, `backend/app/services/llm_chat_service.py`, `backend/app/services/message_service.py` |
| 4 | 回帰テスト追加 | `backend/tests/unit/**` |

## 各コミットメッセージ案

```
#100 issue-100 ドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成
```

```
#100 issue-100 response_formatスキーマを追加
    - ResponseFormatRequestを新規作成し、LlmChatRequest/MessageContentCreateRequestに
      responseFormatフィールドを追加
```

```
#100 issue-100 response_format指定時にAzure OpenAI呼び出しへJSONモードを反映
    - AzureLlmChatClient.stream_chatにresponse_format引数を追加
    - LlmChatService.stream_chat/MessageService.stream_message_contentで
      responseFormat指定時にJSON出力指示のsystemメッセージを前置しresponse_formatを渡すよう変更
```

```
#100 issue-100 response_format対応の回帰テストを追加
    - スキーマ・llm_client・llm_chat_service・message_serviceの各テストを追加
```
