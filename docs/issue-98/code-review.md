# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/core/llm_client.py` | Responses APIストリームの失敗イベント(`error`/`response.failed`)を処理しておらず、web_search/mcp呼び出し失敗時に空回答がOKステータスで永続化されうる | 対応済み |
| 2 | 🟡 注意 | `backend/app/core/llm_client.py` | Responses API呼び出し時、reasoningモデル（gpt-5/o1/o3系）にも無条件で`temperature`を渡している | 対応しない |
| 3 | 🔵 提案 | `backend/app/core/llm_client.py` | `AZURE_OPENAI_RESPONSES_API_VERSION`の値は実環境未検証 | 対応しない（`08_動作確認.md`に明記） |

## 詳細

### 1. Responses APIの失敗イベント未処理（🔴 致命的）→ 対応済み

移植元Java版`OpenAiResponsesClient`は、テキスト差分・完了イベントに加えて`error`イベントも明示的に処理している。一方、当初の実装は`response.output_text.delta`・`response.completed`の2種類のイベントのみを処理し、それ以外（`error`・`response.failed`等）は黙って無視していた。

web_search・mcpは外部サービス（検索エンジン・MCPサーバー）への接続を伴うため、認証失敗・MCPサーバー到達不可・タイムアウト等で失敗する可能性が、既存のChat Completions API単体呼び出しより高い。Responses APIはこうした失敗を必ずしも例外として送出せず、ストリーム内の`error`または`response.failed`イベントとして通知する場合がある。この場合、当初の実装ではテキストデルタが1件も来ないままストリームが正常終了したように見え、呼び出し元（`llm_chat_service.py`・`message_service.py`）は空文字列の回答を`MessageContentStatus.OK`として永続化してしまう。

`backend/app/core/llm_client.py`の`_stream_chat_responses_api`に、`error`/`response.failed`イベント受信時に`RuntimeError`を送出する分岐を追加した。これにより既存の`try/except`（`llm_chat_service.py`・`message_service.py`）に例外が伝播し、既存どおり`error`イベントの送出・`MessageContentStatus.ERROR`での永続化が行われるようになる。

対応するテスト（`test_responses_api_raises_on_error_event`・`test_responses_api_raises_on_failed_event`）を`backend/tests/unit/test_llm_client.py`に追加した。

### 2. reasoningモデルへの`temperature`無条件付与（🟡 注意）→ 対応しない

移植元Java版`OpenAiLlmChatAdapter.buildParams`は、gpt-5/o1/o3系のreasoningモデルでは`temperature`を渡さず`reasoning`パラメータ（effort/summary）を設定する分岐を持つが、本Issueの実装では常に`temperature`を渡す。

ただし、この簡略化は本Issueで新規に導入したものではなく、既存のChat Completions API呼び出し（`AzureLlmChatClient.stream_chat`の非tools経路）も既に同様に無条件で`temperature`を渡しており、reasoningモデル対応・`reasoning`パラメータのサポート自体がこのプロジェクトのスコープに含まれていない（`LlmChatRequest`/`MessageContentCreateRequest`のいずれにも`reasoningEffort`相当のフィールドが存在しない）。tools対応にあたって新たに劣化させたものではなく、reasoningモデル対応は別Issueで扱うべき既存のスコープ外事項と判断し、本Issueでは対応しない。

### 3. Responses APIのAPIバージョン値が未検証（🔵 提案）→ 対応しない

`AZURE_OPENAI_RESPONSES_API_VERSION = "2025-04-01-preview"`は、本環境にAzure OpenAIの実接続情報がなく実際の疎通確認ができていないため、値の妥当性が未検証。`docs/issue-98/08_動作確認.md`の「未確認事項」に明記済みで、実際の疎通確認時にエラーとなる場合は値を調整する必要がある旨を記載している。コード変更ではなくデプロイ・運用時の確認事項のため、本Issueでは追加対応しない。
