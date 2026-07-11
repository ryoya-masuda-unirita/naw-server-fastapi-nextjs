# code-review 結果

`/code-review`（medium effort）を実行し、8観点の並列調査エージェント＋1票検証で洗い出した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/message_service.py` | ストリーミング完了後の永続化（`_persist_message_content`・`_persist_token_usage`）が`try/finally`ではなく逐次処理になっており、クライアント切断時の`GeneratorExit`（`except Exception`では捕捉されない）で丸ごとスキップされ、Azureで既に消費したトークンの記録・回答の永続化が失われる | 対応済み |
| 2 | 🔴 致命的 | `backend/app/services/message_service.py` | ストリーミング中に例外が発生すると、`answer_text = str(e)`で既に配信済みの部分的な回答本文を上書きしてしまい、内部の例外メッセージが永続化・`complete`イベントとしてクライアントへ露出する | 対応済み |
| 3 | 🟡 注意 | `backend/app/services/message_service.py` | `AzureLlmChatClient.stream_chat`呼び出し時の`temperature`・`max_tokens`がコード内で`0.0`/`None`に固定されており、要件定義・詳細設計にこの決定が明記されていなかった | 対応済み（コード内コメント・`03_詳細設計.md`に決定事項として明記） |

## 詳細

### 1. finallyブロック欠落によるストリーミング完了後の永続化スキップ（🔴 致命的）→ 対応済み

`event_stream()`内で、Azure呼び出しの`try/except`の後に`_persist_message_content`・`_persist_token_usage`を逐次呼び出していたため、SSEクライアントが切断した場合にStarletteがこの非同期ジェネレータへ`aclose()`を呼び`GeneratorExit`（`BaseException`のサブクラスで`except Exception`では捕捉されない）を送出すると、両方の永続化処理が丸ごとスキップされていた。Azure OpenAI側では既にトークンが消費・課金されているにもかかわらず、`MessageContent`・`TokenUsage`のどちらにも記録が残らない状態になる。

`try/except`全体を`finally`で包み、`_persist_message_content`・`_persist_token_usage`を`finally`節で必ず実行するよう修正した。ただし`GeneratorExit`処理中は`yield`が禁止されるため、`complete`イベントの送出はストリームが正常終了/エラー終了した場合（`GeneratorExit`によるクローズでない場合）のみに限定した（`stream_finished`フラグで判定）。

回帰テストとして、`tests/unit/test_message_service.py`に`test_persists_content_and_usage_even_when_client_disconnects_mid_stream`を追加し、`text_delta`配信後にジェネレータを`aclose()`しても`MessageContent`の永続化が行われることを検証した。

### 2. 例外時に部分回答が例外メッセージで上書きされる（🔴 致命的）→ 対応済み

`except Exception as e:`ブロック内で`answer_text = str(e)`としていたため、既に`text_delta`イベントとしてクライアントへ配信済みだった部分的な回答本文が失われ、代わりに内部の例外メッセージ（接続情報等を含みうる）が`MessageContent.answer`として永続化され、`complete`イベントとしてクライアントへ返却されていた。

例外発生時も`answer_text`を上書きせず、それまでにストリーミング済みの内容を保持したまま`status=ERROR`で永続化するよう修正した（例外メッセージ自体は従来通り`error`イベントとログには残す）。

回帰テストとして、`test_preserves_partial_answer_when_azure_call_fails_mid_stream`を追加し、途中まで`text_delta`を配信した後に例外が発生した場合、永続化される`answer`が例外メッセージで上書きされず保持されることを検証した。既存の`test_emits_error_event_and_persists_error_status_when_azure_call_fails`（配信前に即例外発生するケース）のアサーションも、保持される`answer`が空文字列になる旨に更新した。

### 3. temperature・max_tokensの固定値化が未文書化（🟡 注意）→ 対応済み（文書化）

`MessageContentCreateRequest`には`temperature`・`max_tokens`に対応するフィールドがなく、`AzureLlmChatClient.stream_chat`呼び出し時に`0.0`・`None`を固定で渡していたが、この決定が`01_要件定義.md`・`03_詳細設計.md`のどちらにも明記されていなかった（Issue #88の`LlmChatRequest`はこれらをリクエストから受け取れる点との差異）。

挙動自体は本Issueのスコープ（基本チャットのみ、`01_要件定義.md`参照）から見て妥当な選択と判断し、コードは変更せず、コード内コメントと`03_詳細設計.md`に「Issue #88のデフォルト値に合わせた固定値である」旨を明記した。将来モデル別の調整が必要になった場合は、`AIModel`側にデフォルト値を持たせる形での対応を検討する。

## その他の調査結果（対応不要と判断）

上記3件のほか、以下も候補として挙がったが、既存コードベースの既定パターンと一致する／新規の規約違反ではないと判断し、対応を見送った。

- `_sse`・`_apply_additional_prompt`・`_persist_token_usage`のIssue #88（`llm_chat_service.py`）との重複実装：本リポジトリの「serviceが別serviceを呼ばない」規約に基づく意図的な複製であり、`message_service.py`自身のdocstringでも明記済み。`core/`への切り出しは設計変更を伴うため本Issueのスコール外とし、対応しない。
- `find_chat_endpoint`のタイブレーク（`endpoint_id`昇順）：既存の類似メソッドと同様の決定的な並び順であり、新規の不具合ではない。
- `Room.updated_at`更新のSELECT→UPDATEパターン：既存の`create_message`と同じスタイルであり、本Issue固有の非効率ではない。
- CLAUDE.md規約違反：該当なし（Angle H調査で違反ゼロを確認）。
