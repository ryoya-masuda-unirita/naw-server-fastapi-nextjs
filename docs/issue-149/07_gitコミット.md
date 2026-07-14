# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-149/` |
| 2 | Bedrock用のEndpointType追加とAnthropic SDK依存追加 | `backend/pyproject.toml`, `backend/app/models/tenant_endpoint.py`, `backend/app/models/ai_model.py` |
| 3 | BedrockLlmChatClientとAIModelRepository.find_by_nameを追加 | `backend/app/core/llm_client.py`, `backend/app/repositories/ai_model_repository.py` |
| 4 | チャットAPIの呼び出し分岐をマルチプロバイダ対応に一般化 | `backend/app/services/llm_chat_service.py`, `backend/seed.sql` |
| 5 | Bedrock対応のテストを追加 | `backend/tests/integration/test_ai_model_repository.py`, `backend/tests/unit/test_llm_client.py`, `backend/tests/unit/test_llm_chat_service.py` |

## 各コミットメッセージ案

```
#149 issue-149 docs/issue-149 のドキュメント一式を作成
    - 00_チケット内容〜07_gitコミットを作成し、Bedrock Mantle経由でのClaude対応方針を記録
```

```
#149 issue-149 Bedrock用のEndpointType追加とAnthropic SDK依存追加
    - EndpointType・AIModelEndpointTypeにBEDROCK_CHATを追加
    - anthropicパッケージをpyproject.tomlに追加
```

```
#149 issue-149 BedrockLlmChatClientとAIModelRepository.find_by_nameを追加
    - Anthropic公式SDK（AsyncAnthropic）を使いBedrock Mantle経由でClaudeをストリーミング呼び出しするクライアントを追加
    - エンドポイント種別を問わずモデル名で検索するfind_by_nameをAIModelRepositoryに追加
```

```
#149 issue-149 チャットAPIの呼び出し分岐をマルチプロバイダ対応に一般化
    - Azure OpenAI固定だったAIモデル・テナントエンドポイントの検索をfind_by_nameベースに変更
    - AIモデルのエンドポイント種別に応じてAzure/Bedrockの呼び出しクライアントを分岐
    - トークン使用量記録のendpoint_type固定値を実際に呼び出したプロバイダに応じた値に修正
    - 動作確認用にseed.sqlへBedrock用tenant_endpoints行を追加
```

```
#149 issue-149 Bedrock対応のテストを追加
    - AIModelRepository.find_by_nameのテストを新規追加
    - BedrockLlmChatClientの単体テストを追加
    - llm_chat_serviceのモック対象をfind_by_nameへ置換し、Bedrock分岐のテストケースを追加
```
