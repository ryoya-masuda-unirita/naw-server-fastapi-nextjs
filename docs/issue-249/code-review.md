# code-review 結果

`/code-review high 261` の結果。🔴 致命的の指摘はなかった。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | Bedrock の出力上限に `ai_models.max_tokens` をそのまま使っており、コンテキスト長相当の値が登録されていると Bedrock に拒否される | 対応しない |
| 2 | 🟡 注意 | `backend/app/repositories/assistant_endpoint_repository.py` | Azure・Bedrock の両方を紐づけたアシスタントで、送信先が endpoint_id（UUID）の並びで決まり、従来 Azure で動いていた送信が Bedrock に切り替わりうる | 対応済み |
| 3 | 🟡 注意 | `backend/app/services/llm_chat_service.py` | Bedrock の tools 検証（400）が、エンドポイント・messageId の存在確認や所有者確認（404/403）より前にあり、エラーの優先順位が変わる | 対応済み |
| 4 | 🔵 提案 | `backend/app/services/message_service.py` | 空白だけの履歴発話は Anthropic Messages API に拒否されるが、事前に検証していない | 対応しない |
| 5 | 🔵 提案 | `backend/app/services/llm_chat_service.py` | 「Bedrock の未指定時はモデル上限」の判断が呼び出し側 2 か所に散らばった | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/message_service.py` | 「Bedrock なら validate_request → 400」のブロックが 2 つのサービスで重複している | 対応しない |

## 詳細

### 1. Bedrock の出力上限にモデルの上限をそのまま使っている（🟡 注意）→ 対応しない

未指定時に Bedrock へモデルの上限（`ai_models.max_tokens`）を渡すのは #149 からの挙動（`max_tokens_fallback`）で、本 Issue ではそれを呼び出し側へ移しただけ。Bedrock 用のシードデータ（`anthropic.claude-haiku-4-5`）は出力上限の 64000 を登録しており、Bedrock のモデルは出力上限を登録する運用で成り立つ。`ai_models.max_tokens` の意味（コンテキスト長か出力上限か）の整理は、Azure 側の未指定時の扱いも含めて本 Issue の範囲を超えるため、ここでは変えない。

### 2. Azure・Bedrock の両方を紐づけた場合の送信先（🟡 注意）→ 対応済み

`find_chat_endpoint` の並び順を「Azure OpenAI を優先し、同じ種別の中では endpoint_id の昇順」に変えた。Bedrock 対応前は Azure しか解決しなかったため、両方を紐づけたアシスタントの送信先が従来どおり Azure になる。移植元 `MessageService` はチャット種別の最初の 1 件を選ぶだけでプロバイダの優先はないが、既存の送信先を変えないことを優先した。結合テスト `TestFindChatEndpoint.test_prefers_azure_when_both_azure_and_bedrock_are_linked`（Bedrock の ID のほうが小さい状況で Azure が選ばれること）を追加した。

### 3. tools 検証とほかのエラーの優先順位（🟡 注意）→ 対応済み

`llm_chat_service.py` の Bedrock の tools 検証を、エンドポイントの存在確認と messageId の存在確認・所有者確認の後ろへ移した。単体テスト `test_message_not_found_takes_precedence_over_bedrock_tools_error`（tools 指定と存在しない messageId で 404 になること）を追加した。`message_service.py` の検証は、もともとメッセージの存在確認・所有者確認・エンドポイント/AI モデルの解決の後ろにあるため変更していない。

### 4. 空白だけの履歴発話（🔵 提案）→ 対応しない

本 Issue の対象（tools など Bedrock 非対応のパラメータ）ではなく、#149 からある入力検証の問題。必要なら別 Issue で扱う。

### 5. 未指定時の上限補完が 2 か所にある（🔵 提案）→ 対応しない

呼び出し側は 2 か所で、どちらも 1 行の条件式にコメントを付けている。クライアントに戻すと「Azure は未指定なら送らない・Bedrock はモデル上限」という違いが呼び出し側から見えにくくなるため、今の形のままにする。

### 6. 事前検証ブロックの重複（🔵 提案）→ 対応しない

重複は 2 か所で各 8 行程度。共通化すると `core/llm_client.py`（HTTP に依存しない層）に `HTTPException` を持ち込むか、新しい共通モジュールが必要になり、得られる効果に見合わない。検証項目が増えるときに共通化を検討する。
