# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-88/` |
| 2 | クレジット上限チェック・クレジット計算・Azure OpenAIクライアントの追加 | `app/core/credit_quota.py`, `app/core/llm_client.py`, `app/core/config.py`, `app/models/token_usage.py`, `pyproject.toml`, `uv.lock` |
| 3 | LLMチャット・埋め込みAPIの実装 | `app/schemas/llm.py`, `app/services/llm_chat_service.py`, `app/services/llm_embedding_service.py`, `app/routers/llm.py`, `app/repositories/ai_model_repository.py`, `app/main.py` |
| 4 | テスト追加 | `backend/tests/unit/test_*.py` |
| 5 | code-review指摘対応（必要な場合） | 指摘に応じたファイル |

## 各コミットメッセージ案

```
#88 issue-88 00_チケット内容.md を作成
```

```
#88 issue-88 LLM呼び出し用のクレジット上限チェック・クレジット計算・Azure OpenAIクライアントを追加
    - core/credit_quota.py でテナント月次クレジット上限チェックを実装
    - core/llm_client.py でAzure OpenAI Chat/Embeddings呼び出しクライアントを実装
    - config.py にLLMクレジット計算用設定を追加
    - token_usage.py にクレジット計算関数を追加
```

```
#88 issue-88 LLMチャット・埋め込みAPIを実装
    - POST /api/llm/chat でSSEストリーミング応答を実装
    - POST /api/llm/embedding を実装
    - ai_model_repository.py に endpoint_type+name 検索を追加
```

```
#88 issue-88 LLMチャット・埋め込みAPIのテストを追加
```
