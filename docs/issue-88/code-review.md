# code-review 結果

`/code-review --effort medium` を実行し、8つの調査観点（line-by-line diff scan / removed-behavior auditor / cross-file tracer / DB session lifecycle / reuse / simplification / efficiency / altitude・conventions）でサブエージェントにレビューを委譲した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `app/services/llm_chat_service.py` | `messageId`指定時にルーム所有権チェックが行われておらず、他ユーザーのmessageIdを指定するとそのルームにトークン使用量を紐付けられてしまう(IDOR) | 対応済み |
| 2 | 🟡 注意 | `app/services/llm_chat_service.py`(`_apply_additional_prompt`) | 会話履歴の末尾要素を無条件に書き換えており、移植元(`applyAdditionalPromptToLastUserTurn`)のように末尾から遡って"user"ロールの発話を探していない。区切り文字も`\n`(移植元は`\n\n`) | 対応済み |
| 3 | 🟡 注意 | `app/core/llm_client.py` | `AsyncAzureOpenAI`クライアントがリクエストごとに生成されるが、明示的にクローズされずコネクションリークの懸念がある | 対応済み |
| 4 | 🟡 注意 | `app/services/llm_chat_service.py` / `llm_embedding_service.py` | `ai_model.token_weight`が0以下・NaN・無限大等の不正値の場合のフォールバックがなく、移植元`toPositiveTokenWeight`(1.0にフォールバック)を踏襲していない | 対応済み |
| 5 | 🔵 提案 | `app/services/llm_chat_service.py`(`_persist_token_usage`) | 入出力トークンが両方0以下の場合は永続化をスキップしており、設計ドキュメントの「完了時（正常・異常問わず）...1件保存する」という記述と字面上ずれる | 対応しない |
| 6 | 🟡 注意 | `app/services/llm_chat_service.py`(`event_stream`) | 移植元`SseEmitter(180_000L)`相当の180秒タイムアウトがなく、Azure呼び出しが長時間ハングした場合にリクエストが無期限に保持されうる | 対応しない |
| 7 | 🔵 提案 | `app/core/credit_quota.py` | `tenant_service.py`の`_assert_new_max_usage_based_credits_not_below_current_usage`と請求期間・利用量の計算ロジックが重複している | 対応しない |
| 8 | 🔵 提案 | `app/services/llm_chat_service.py` / `llm_embedding_service.py` | AIModel/TenantEndpoint解決処理が2つのserviceでほぼ同一のコードとして重複している | 対応しない |

## 詳細

### 1. messageId指定時のルーム所有権チェック漏れ（🔴 致命的）→ 対応済み

移植元(Spring Boot) `LlmChatService.resolveContext`を確認したところ、`messageId`からルームIDを取得する際に所有権検証を行っていないことを確認した。しかし、これは移植元自体のセキュリティ上のギャップであり、他のメッセージ関連エンドポイント（`message_service.py`の`require_owned_room`呼び出し等）とも一貫しない。加えて、本Issueの`01_要件定義.md`には「既存の質問スレッド（`messageId`）を指定した場合、その所属ルームの所有者本人であることを検証する」と明記しており、実装がそれに反していた。

`app/services/llm_chat_service.py`の`stream_chat`内、`messageId`解決直後に`require_owned_room(tenant_id, current_user, message.room_id, session)`を追加し、所有者でない場合は403を返すよう修正した。移植元との差分はコード内コメントに明記した。テスト`test_raises_403_when_message_room_not_owned`を追加。

### 2. additionalPromptの適用対象・区切り文字（🟡 注意）→ 対応済み

移植元`applyAdditionalPromptToLastUserTurn`は、会話履歴の末尾から遡って最初に見つかった`"user"`ロール（大文字小文字を区別しない）の発話にのみ追加プロンプトを前置し、区切り文字は`"\n\n"`である。実装は単純に配列末尾の発話を書き換えており、末尾が`assistant`/`system`ロールの場合に誤った発話を書き換えてしまう・区切りが`"\n"`になってしまう不整合があった。

`_apply_additional_prompt`を、末尾から`"user"`ロールを探索するロジックに修正し、区切り文字も`"\n\n"`に修正した。該当ロールが存在しない場合は何もしない（移植元と同様）。テスト4件を追加。

### 3. Azure OpenAIクライアントの未クローズ（🟡 注意）→ 対応済み

`AzureLlmChatClient.stream_chat`・`AzureLlmEmbeddingClient.create_embedding`が、リクエストごとに`AsyncAzureOpenAI`クライアントを生成しているが、明示的にクローズしていなかった。高頻度呼び出し時にコネクションリソースが解放されない懸念があるため、`async with AsyncAzureOpenAI(...) as client:`で囲み、ストリーム消費完了・レスポンス取得完了まで含めて確実にクローズされるよう修正した。テスト側も`__aenter__`/`__aexit__`を設定するよう更新した。

### 4. token_weightの不正値フォールバック（🟡 注意）→ 対応済み

移植元`AIModelService.toPositiveTokenWeight`は、`token_weight`が0以下・NaN・無限大の場合に1.0へフォールバックする。実装にはこのフォールバックがなく、不正なデータが`ai_models`テーブルに混入した場合に誤ったクレジット数（0や無限大）が算出されうる状態だった。

`app/core/token_usage_credit.py`に`positive_token_weight`関数を追加し、`llm_chat_service.py`・`llm_embedding_service.py`の両方で使用するよう修正した。単体テスト3件を追加。

### 5. トークン使用量の永続化スキップ条件（🔵 提案）→ 対応しない

移植元`streamAndPersist`は、ストリーム処理が正常完了して`result`（トークン使用量を含む）が得られた場合にのみ永続化し（`finally`ブロックで`if (result != null)`）、例外発生時（`result`が`null`のまま）は永続化しない。実装の「入出力トークンが両方0以下ならスキップ」という条件は、例外発生時に両トークンが初期値の0のまま残る実装と組み合わさることで、移植元の「例外時は永続化しない」という挙動と実質的に同じ結果になる。`03_詳細設計.md`の記述（「完了時（正常・異常問わず）...1件保存する」）は移植元の実際の挙動を正確に反映していなかったための表現のずれであり、実装（移植元の挙動によりよく一致する方）を正として据え置く。

### 6. SSEストリーミングのタイムアウト未実装（🟡 注意）→ 対応しない

移植元は`SseEmitter(180_000L)`で180秒のハードタイムアウトを設定しているが、本実装の`StreamingResponse`にはタイムアウト機構がない。Azure呼び出しがハングした場合、リクエストが無期限に保持されるリスクがある。対応にはジェネレータ全体を`asyncio.wait_for`等でラップし、タイムアウト時のキャンセル処理・SSE`error`イベント送出を追加する必要があり、本Issueのスコープ（基本チャット実装）を超える追加設計が必要と判断し、後続Issueでの対応に委ねる。

### 7. credit_quota.pyとtenant_service.pyの計算ロジック重複（🔵 提案）→ 対応しない

`enforce_within_quota`（クォータ超過チェック）と`tenant_service.py`の`_assert_new_max_usage_based_credits_not_below_current_usage`（上限変更時の整合性チェック）は、請求期間・利用量の算出ロジックが同一である。移植元Java版も`TenantMonthlyCreditQuotaService`と`TenantService`（の該当ロジック）で別クラスとして実装されており、目的（呼び出し前のクォータ検証 vs 設定変更時の整合性チェック）が異なるため意図的に分離した設計を踏襲している。共通化する場合は両者が依存する新たな`core/`ヘルパーの抽出が必要になり、本Issueのスコープを超えるため見送る。

### 8. AIModel/TenantEndpoint解決処理の重複（🔵 提案）→ 対応しない

`llm_chat_service.py`と`llm_embedding_service.py`のAIModel/TenantEndpoint解決部分（15行程度）が類似している。重複は軽微（2箇所のみ）であり、無理に共通化すると呼び出し元ごとに微妙に異なるエラーメッセージ・例外条件の違いを吸収するための抽象化コストの方が大きくなると判断し、現状維持とした。3箇所目の重複が発生した時点（Rule of Three）で共通化を検討する。
