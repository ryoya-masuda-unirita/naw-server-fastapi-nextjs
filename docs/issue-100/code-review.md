# code-review 結果

`/code-review`（medium）を実行した。8角度（正当性3・クリーンアップ3・altitude・conventions）のfinderをサブエージェントで並列実行し、重複排除・1票検証を行った。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/services/message_service.py` | SAAS_RAG時、JSON出力指示のsystemメッセージがRAGコンテキストのsystemメッセージより後ろに挿入され、コード内コメント・`03_詳細設計.md`が明記する「JSON出力指示を先頭に置く」設計と実装が矛盾していた | 対応済み |

## 詳細

### 1. SAAS_RAG + responseFormat指定時、JSON出力指示がRAGコンテキストより後ろになっていた（🟡 注意）→ 対応済み

`MessageService.stream_message_content`では、当初以下の順でメッセージ列を組み立てていた。

1. `_apply_additional_prompt`で会話履歴を組み立てる
2. `_prepend_json_response_instruction`でJSON出力指示のsystemメッセージを**先頭に追加**（この時点でindex 0）
3. `assistant.type == AssistantType.SAAS_RAG`かつ`rag_context`が非空の場合、RAGコンテキストのsystemメッセージを**さらに先頭に追加**

この結果、SAAS_RAGアシスタントに`responseFormat`を指定した場合、実際のメッセージ列の先頭はRAGコンテキストのsystemメッセージになり、JSON出力指示は2番目に後退していた。これは同じ関数内のコメント（「JSON出力指示は最も外側の振る舞い指定として、RAGコンテキストのsystemメッセージより先頭に置く」）および`docs/issue-100/03_詳細設計.md`の記載と矛盾する実装だった。

OpenAIのJSONモード自体はメッセージ内のどこかに"json"という語が含まれていれば動作要件を満たすため、機能的に応答がJSON形式にならなくなるわけではないが、意図した優先順位（JSON出力指示を最も外側の指定として扱う）が実装で担保されておらず、将来RAGコンテキストが長大化した場合にモデルがJSON指示を見落とす可能性が上がる、かつ設計ドキュメントと実装が食い違ったまま残るという問題があったため、🟡として修正した。

**修正内容**: `_prepend_json_response_instruction`の呼び出しをRAGコンテキスト挿入処理の**後**に移動し、常にJSON出力指示が最終的なメッセージ列の先頭に来るようにした（`backend/app/services/message_service.py`）。回帰テスト`test_json_response_instruction_precedes_rag_context_message`（`backend/tests/unit/test_message_service.py`）を追加し、SAAS_RAG + responseFormat指定時の順序を固定した。

## その他検討した観点（指摘に至らなかったもの）

- `ResponseFormatRequest.type`の`@field_validator`によるバリデーションは、`Literal["json_object", "json_schema"]`型で表現する方がPydantic v2的にはより宣言的だが、本リポジトリの既存パターン（`ToolConfig.name`等）が同様に`@field_validator`でのバリデーションを採用しており、日本語エラーメッセージを返す必要があるため、既存パターンとの一貫性を優先し現状の実装を維持した
- `llm_chat_service.py`・`message_service.py`間でのヘルパー関数（`_build_llm_response_format`・`_prepend_json_response_instruction`・`_JSON_RESPONSE_INSTRUCTION`）の重複は、既存の`_sse`・`_apply_additional_prompt`と同様に「serviceが別serviceを呼ばない」という本リポジトリのアーキテクチャ規約に基づく意図的な重複であり、問題として扱わなかった
- `response_format.type`の値（`json_object`/`json_schema`）にかかわらず常に`{"type": "json_object"}`として扱う実装は、移植元Java版でも`json_schema`が未実装であることをコード内コメント・`01_要件定義.md`で明記しており、意図的な設計判断として扱った
