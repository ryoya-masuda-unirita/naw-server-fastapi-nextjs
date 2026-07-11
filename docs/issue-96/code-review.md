# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/message_service.py`（`_build_rag_context`） | `AzureLlmEmbeddingClient.create_embedding`の呼び出しが例外処理されておらず、埋め込みAPI呼び出し失敗（認証エラー・ネットワークエラー等）が未捕捉の例外として伝播し500になる。ベクトル検索呼び出し（`AzureAiSearchVectorStoreClient.similarity_search`）は同様の失敗を400へ変換しているため非対称だった | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/message_service.py`（`_build_rag_context`） | テナントに複数のVDBタイプエンドポイントが存在する場合、`find_by_tenant_id_and_type`にORDER BYがないため`vdb_endpoints[0]`の選択が非決定的だった。埋め込みエンドポイント選択は`id`最小で決定的に選ぶのに対し非対称だった | 対応済み |
| 3 | 🟡 注意 | `backend/app/services/message_service.py`（`_build_rag_context`） | ベクトル検索（埋め込み生成含む）が成功した後にAzure AI Searchへの接続自体が失敗した場合、消費済みの埋め込みトークンが永続化されない（例外によりストリーミング開始前に処理が中断するため） | 対応しない |
| 4 | 🟡 注意 | `backend/app/services/message_service.py`（`_persist_message_content`） | 参照ファイルパスをカンマ区切り文字列として保存するため、`File.reference`にカンマが含まれる場合に破損する | 対応しない |
| 5 | 🟡 注意 | `backend/app/services/message_service.py`（`_build_rag_context`） | 同一ファイルが複数の検索結果にヒットした場合、参照ファイルパスが重複して追加される（デデュープしていない） | 対応しない |
| 6 | 🔵 提案 | `backend/app/services/message_service.py`（`_build_rag_context`） | 埋め込みエンドポイント選択のように、決定的な選び方をSQLの`ORDER BY`側に寄せる（`IndexRepository`側でソート済みの結果を返す）方が、Python側で`sorted()`するより一貫性がある | 対応しない |
| 7 | 🔵 提案 | `backend/app/services/message_service.py`（`_build_rag_context`） | チャット用AIモデル解決・RAGコンテキスト構築（埋め込みモデル解決含む）は相互に独立した非同期処理のため、`asyncio.gather`で並列化する余地がある | 対応しない |

## 詳細

### 1. 埋め込みAPI呼び出しの例外未処理（🔴 致命的）→ 対応済み

`stream_message_content`は、ストリーミング開始前の検証失敗をすべて`HTTPException(400)`として返す設計方針（`01_要件定義.md`・`02_基本設計.md`参照）だが、`_build_rag_context`内の`AzureLlmEmbeddingClient.create_embedding`呼び出しだけ例外処理がなく、Azure OpenAI Embeddings APIの認証エラー・ネットワークエラー等が未捕捉のまま伝播し、クライアントには500として返っていた。直後の`AzureAiSearchVectorStoreClient.similarity_search`は同様の失敗を明示的に400へ変換しているため、設計方針との非対称性があった。

`create_embedding`呼び出しを`try/except`で囲み、失敗時は`HTTPException(400, "Failed to create embedding for RAG search")`に変換するよう修正した。あわせて、この失敗ケースを検証する回帰テスト`test_raises_400_when_rag_embedding_creation_fails`を`backend/tests/unit/test_message_service.py`に追加した。

### 2. VDBエンドポイント選択の非決定性（🟡 注意）→ 対応済み

`TenantEndpointRepository.find_by_tenant_id_and_type`にはORDER BYがなく、テナントに複数のVDBタイプエンドポイントが存在する場合`vdb_endpoints[0]`の選択がDBの返却順に依存し非決定的だった。埋め込みエンドポイント選択（`id`最小を採用）と一貫性を持たせるため、`min(vdb_endpoints, key=lambda e: e.id)`で決定的に選ぶよう修正した。

移植元（Spring Boot）の`tenantEndpointRepository.findByTenantIdAndType(...).stream().findFirst()`も明示的な順序を持たないため元々の挙動と厳密に一致しているわけではないが、複数存在する場合の運用を安定させる目的で決定的な選択に統一した。

### 3. ベクトル検索失敗時に埋め込みトークンが記録されない（🟡 注意）→ 対応しない

埋め込み生成が成功した後にAzure AI Search側の接続・検索が失敗した場合、例外がストリーミング開始前に伝播し`_persist_token_usage`が呼ばれないため、既に消費した埋め込みトークンが記録されない。

移植元（Spring Boot）の`buildRagContext`も、`vectorStore.similaritySearch(...)`が例外を送出した場合は同様に呼び出し元へ例外が伝播し、その時点でトークン使用量は永続化されない（`persistMessageContent`はこの後続処理として実行されるため）。つまり本挙動は移植元と同一であり、本Issueのスコープでは仕様として維持する。将来的に対応する場合は、埋め込み呼び出し成功時点で消費トークン数を別途記録する仕組み（例外発生時も部分的な使用量を保存する専用パス）が必要になり、既存のSAAS_CHATの「ストリーミング開始前の検証は例外時に永続化しない」という設計とも整合を取る必要があるため、本Issueとは別に検討する。

### 4. 参照ファイルパスのカンマ区切り保存によるカンマ混入時の破損（🟡 注意）→ 対応しない

`_persist_message_content`は参照ファイルパス一覧をカンマ区切り文字列として`MessageContent.file_paths`に保存し、`_split_reference_paths`（本Issue以前から存在する既存関数）でカンマ区切りとして復元する。`File.reference`は自由入力の255文字までの文字列のため、理論上カンマを含みうる。

この「カンマ区切りで保存・復元する」設計は本Issueで新規に導入したものではなく、`get_message_contents`が`_split_reference_paths`を使って`content.file_paths`を復元する処理としてissue-93以前から既に存在する、このリポジトリの既存規約である。本Issueはこの既存の永続化形式に新しい値（RAG検索で解決したファイルの`reference`）を流し込んでいるに過ぎない。`reference`列の実際の値はファイルアップロード時に生成されるストレージパス相当の文字列であり、運用上カンマが混入する想定は薄いと判断し、本Issueのスコープでは対応しない。区切り文字の変更（JSON化等）は既存の`file_paths`列全体の設計変更になるため、別Issueで検討する。

### 5. 同一ファイルが複数ヒットした場合の参照ファイルパス重複（🟡 注意）→ 対応しない

ベクトル検索結果に同一`fileUniqueId`が複数回出現した場合、`reference_paths`に同じ参照パスが重複して追加される。

移植元（Spring Boot）の`buildRagContext`も、検索結果`Document`ごとのループ内で`fileRepository.findByIdAndTenantId(fileId, tenantId).ifPresent(file -> { ...; referenceFilePaths.add(file.getReference()); })`と無条件に追加しており、デデュープしていない。本挙動は移植元と同一のため、本Issueのスコープでは仕様として維持する。

### 6. エンドポイント選択の決定的順序をSQL層に寄せる提案（🔵 提案）→ 対応しない

現状`_build_rag_context`はPython側で`sorted()`/`min()`により決定的な選択を行っている。`AssistantEndpointRepository.find_chat_endpoint`のようにSQLの`ORDER BY`に寄せる設計の方が一貫性があるという指摘は妥当だが、`IndexRepository.find_tenant_endpoints_grouped_by_index_ids`は複数の呼び出し元（一覧表示等）で共有されるメソッドであり、この1呼び出し元のためだけに新しい専用メソッドを追加するのはオーバーエンジニアリングと判断し、本Issueでは対応しない。

### 7. 独立した非同期処理の並列化提案（🔵 提案）→ 対応しない

チャット用AIモデル解決とRAGコンテキスト構築（埋め込みモデル解決含む）は独立しており`asyncio.gather`で並列化する余地があるが、いずれも単発のDBクエリ・軽量な処理でありレイテンシ改善効果は小さい一方、`try/except`を含む複数の非同期処理をまとめて並列化するとエラーハンドリングが複雑になる。可読性を優先し、本Issueでは対応しない。
