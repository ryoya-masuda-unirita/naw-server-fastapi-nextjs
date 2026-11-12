# code-review 結果

PR #199 に対して `/code-review` を実行した結果と、各指摘への対応。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/core/llm_client.py` | 添付画像がOpenAI形式（`image_url`）のままAnthropicへ送られ400になる | 対応済み |
| 2 | 🔴 致命的 | `backend/app/repositories/ai_model_repository.py` | `find_by_name`が種別で絞らず`ORDER BY`もないため、同名モデルが複数あると選ばれる行が不定 | 対応済み |
| 3 | 🔴 致命的 | `backend/alembic/versions/023_add_bedrock_chat_endpoint_type.py` | `BEDROCK_CHAT`の行が残っているとdowngradeのenum castが失敗する | 対応済み |
| 4 | 🟡 注意 | `backend/app/services/llm_chat_service.py` | Bedrock経路で`responseFormat`（JSONモード）が強制されない | 対応しない |
| 5 | 🟡 注意 | `backend/app/core/llm_client.py` | `tools`指定時のエラーがHTTP 200返却後のSSE `error`になり、0トークンの利用量行が記録される | 対応しない |
| 6 | 🟡 注意 | `backend/app/core/llm_client.py` | roleを正規化せずに渡しているため、`User`等の大文字を含むroleが400になる | 対応済み |
| 7 | 🟡 注意 | `backend/app/models/ai_model.py` | `ai_models.name`が`String(32)`で、日付・バージョン付きのBedrockモデルIDを登録できない | 対応しない |
| 8 | 🔵 提案 | `backend/app/services/llm_chat_service.py` | 種別ごとの分岐が3か所に散らばり、プロバイダ追加時に更新漏れが起きやすい | 対応済み |
| 9 | 🔵 提案 | `backend/app/services/llm_chat_service.py` ほか | docstringが古い（Azure固定の記述、存在しないモデルIDの例） | 対応済み |

## 詳細

### 1. 添付画像がAnthropic形式に変換されない（🔴 致命的）→ 対応済み

`build_user_content`はOpenAI Chat Completions API形式（`{"type": "image_url", "image_url": {"url": "data:...;base64,..."}}`）でcontentを組み立てるが、Anthropic Messages APIは`{"type": "image", "source": {"type": "base64", ...}}`しか受け付けない。

`llm_client.py`に`_to_anthropic_content`を追加し、`BedrockLlmChatClient`がメッセージを送る前に、テキストパートはそのまま、`image_url`パート（base64のdata URL）は`image`パートへ変換するようにした。base64のdata URLでない画像や、未知の種別のパートは`ValueError`にする。

単体テスト（変換・data URLでない画像の拒否）を追加し、実機でも`build_user_content`で組み立てた画像付きメッセージにBedrockから正しく応答が返ることを確認した（`08_動作確認.md` Step 4）。

### 2. モデル検索で選ばれる行が不定（🔴 致命的）→ 対応済み

`ai_models.name`には一意制約がないため、同名のモデルが別の種別でも登録されていると、どの行が返るかが不定だった（例えば`gpt-4o`が`OPENAI_CHAT`と`AZURE_OPENAI_CHAT`の両方にあると、`OPENAI_CHAT`が返って400になる場合がある）。

`find_by_name`を`find_by_name_and_endpoint_types`に置き換えた。チャットAPIが扱える種別（Azure OpenAI/Bedrock）に絞り、`ORDER BY id`で先頭を返す。統合テストで、指定外の種別を無視することと、同名が複数ある場合にidが最小の行を返すことを確認した。

### 3. downgradeのenum castが失敗する（🔴 致命的）→ 対応済み

`downgrade()`で、型を作り直す前に`tenant_endpoints`・`ai_models`から`BEDROCK_CHAT`の行を削除するようにした。旧スキーマでは`BEDROCK_CHAT`を表現できず、残しても使えない行のため。`assistants_endpoints`等は`tenant_endpoints`へのFKが`ON DELETE CASCADE`なので連動して消える。

ローカルDBにseedで`BEDROCK_CHAT`の行が入った状態で`alembic downgrade 022`→`upgrade head`→seed再投入が成功することを確認した。

### 4. Bedrock経路で`responseFormat`が強制されない（🟡 注意）→ 対応しない

`03_詳細設計.md`で、Bedrock側はAzure相当の構造化出力パラメータを持たず、`llm_chat_service.py`が前置する汎用のJSON出力指示のみで対応すると決めている。Claudeで出力形式を強制するには、tool useによる構造化出力など別の設計が必要になり、本Issueのスコープ（Bedrock経由でのチャット呼び出し）を超えるため、必要になった時点で別Issueで扱う。

### 5. `tools`指定時のエラーが200返却後になる（🟡 注意）→ 対応しない

`03_詳細設計.md`で、`tools`指定時は`BedrockLlmChatClient`が`ValueError`を送出し、既存の`try/except`でSSEの`error`イベントに変換する方針と決めている。Azure経路でもストリーミング開始後のエラーは同じくSSEの`error`イベントで返しており、エラーの返し方として一貫している。0トークンの利用量行が記録される点も、Azure経路でエラーになった場合と同じ既存の挙動である。

### 6. roleの正規化（🟡 注意）→ 対応済み

`system`の判定は`role.lower()`で行っている一方、会話メッセージは元のroleのまま渡していた。会話メッセージのroleも小文字に正規化して渡すようにし、単体テストを追加した。

### 7. `ai_models.name`が`String(32)`（🟡 注意）→ 対応しない

日付・バージョン付きのモデルID（`InvokeModel`/`Converse` API用）が入らないことは`08_動作確認.md`の補足調査で確認済み。本実装が呼び出すBedrock Mantleは短い形式のID（例: `anthropic.claude-haiku-4-5`）を使い、これは32文字に収まる。カラム長の変更は`deployName`・`token_usages.model`にも波及するスキーマ変更のため、本Issueでは行わない。

### 8. 種別ごとの分岐の集約（🔵 提案）→ 対応済み

`llm_chat_service.py`に`_CHAT_TENANT_ENDPOINT_TYPES`（AIモデルの種別→テナントエンドポイントの種別）を定義し、モデル検索の絞り込みとエンドポイントの解決をこの1か所で管理するようにした。種別チェックと三項演算子による対応付けは不要になったため削除した。

### 9. 古いdocstring（🔵 提案）→ 対応済み

`stream_chat`の`Raises`をBedrockを含む記述に、`llm_client.py`のモジュールdocstringをBedrockを含む記述に、`BedrockLlmChatClient.stream_chat`の`model_id`の例を実在する`anthropic.claude-haiku-4-5`に更新した。
