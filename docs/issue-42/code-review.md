# code-review 結果

`/code-review high`（8角度の並列finder + 検証）を実行。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `app/models/ai_model.py`・`alembic/versions/009_add_ai_models.py` | `AIModel.endpoint_type`がSQLModelの暗黙マッピングでネイティブPostgres Enum型を要求するが、マイグレーションは`varchar(32)`しか作成しておらず、ORM経由のINSERTが`UndefinedObjectError`で失敗する | 対応済み |
| 2 | 🔴 致命的 | `app/services/assistant_service.py`（`_SORT_ALIASES`）・`app/repositories/assistant_repository.py`（`find_page`） | 実際のフロントエンド（secuaigent-client）が送信する`sort=assistantType`が未対応で、種別ソートが無言でupdatedAtソートにフォールバックしていた | 対応済み |
| 3 | 🟡 注意 | `app/schemas/assistant.py`（`AssistantUpdateRequest._validate_name`） | `name`に空文字を送ると422になるが、移植元`isNameNotBlankWhenPresent`は空文字を「変更なし」として許可している | 対応済み |
| 4 | 🟡 注意 | `app/services/assistant_service.py`（`update_assistant`） | `description`/`iconColor`に空文字を送ると既存値が消去されるが、移植元`isNotBlank`チェックでは変更されない仕様だった | 対応済み |
| 5 | 🟡 注意 | `app/services/assistant_service.py`（`_resolve_endpoint_types`） | エンドポイントIDの重複をチェックしておらず、`assistants_endpoints`のPK制約違反で未処理の500になる経路があった | 対応済み |
| 6 | 🔵 提案 | `app/services/assistant_service.py`（`_to_get_response`） | `endpoints_map`・`categories_map`引数の型ヒントが素の`dict`でジェネリック型パラメータが欠落していた（CLAUDE.md違反） | 対応済み |
| 7 | 🔵 提案 | `app/repositories/assistant_endpoint_repository.py` | 未使用メソッド`find_by_assistant_id_and_tenant_id`が残っていた | 対応済み |
| 8 | 🔵 提案 | `app/services/assistant_service.py`・`app/core/security.py` | `sort`文字列のパース、`_is_tenant_admin`相当の判定、`require_admin`/`require_admin_or_group_admin`のロールチェックが、既存の`group_service.py`等と同種のロジックをそれぞれ再実装している | 対応しない |
| 9 | 🔵 提案 | `app/repositories/assistant_category_mapping_repository.py`・`group_assistant_repository.py`・`assistant_endpoint_repository.py` | 「全削除→バルクINSERT」の置き換えパターンが3つのリポジトリにそれぞれ再実装されている（`group_prompt_template_repository.py`と同型） | 対応しない |
| 10 | 🔵 提案 | `app/services/assistant_service.py`（`create_assistant`/`update_assistant`） | カテゴリ・グループを`_replace_relations`で解決した後、レスポンス組み立て時に`_build_responses`が同じデータを再クエリしている | 対応しない |
| 11 | 🔵 提案 | `app/schemas/assistant.py`（`PagedAssistantResponse`） | CLAUDE.mdが言及する共通`PagedResponse[T]`（`schemas/pagination.py`）がまだ存在せず、既存の`PagedGroupMemberResponse`等と同型のレスポンスクラスを新たに手書きしている | 対応しない |
| 12 | 🔵 提案 | `app/core/security.py`（`require_admin_or_group_admin`） | Group/PromptTemplate管理APIは作成・更新・削除を`require_admin`（テナント管理者専用）に絞っているのに対し、Assistant管理APIは一覧同様グループ管理者にもCRUD全体を許可しており、権限モデルの一貫性がない | 対応しない（意図的、後述） |

## 詳細

### 1. AIModelのEnum型とマイグレーションの不整合（🔴 致命的）→ 対応済み

`app/models/ai_model.py`の`endpoint_type: AIModelEndpointType = Field(max_length=32)`は`sa_column`未指定のため、SQLModelが`(str, Enum)`型を検出して`sa.Enum(AIModelEndpointType)`（ネイティブPostgres Enum、型名`aimodelendpointtype`）へ自動マッピングする。一方マイグレーション`009_add_ai_models.py`は`sa.String(32)`で列を作成しており、`CREATE TYPE aimodelendpointtype`が一度も発行されない。

レビューエージェントが実際のローカルPostgresに対してORM経由のINSERTを再現し、`asyncpg.exceptions.UndefinedObjectError: type "aimodelendpointtype" does not exist`を確認した。テストスイートはSQLite（`Base.metadata.create_all()`）で動くため、この不整合はテストでは検出されない。

`tenant_endpoints`（`EndpointType`）と同じ既存パターンに揃え、マイグレーションを`sa.Enum(..., name="aimodelendpointtype")`で列作成するよう修正（downgradeに`DROP TYPE`も追加）。ローカルDBを`alembic downgrade 008` → `alembic upgrade head`で再構築し、ORM経由のINSERTが成功することを直接確認した。

### 2. ソートキー`assistantType`の未対応（🔴 致命的）→ 対応済み

移植元Javaの`PageableSortUtil.remapSort`は`serverType`/`server`/`type`→`assistantType`のマッピングだったため、Python側でも`serverType`/`server`→`type`のエイリアスのみ用意していた。しかし実際のフロントエンド（`secuaigent-client/src/types/admin/assistant.types.ts`）の`AssistantSortField`は`'name' | 'updatedAt' | 'assistantType' | 'includeHistory'`であり、literal `assistantType`をそのまま送信する。

このキーはエイリアス辞書にも`assistant_repository.find_page`の`if/elif`チェーンにも該当せず、無言で`updatedAt`ソートにフォールバックしていた（エラーにならないため発見が困難）。`_SORT_ALIASES`に`"assistantType": "type"`を追加し、`find_page`に`includeHistory`列（同じくフロントエンドが対応するソートキー）のハンドリングも追加した。実際のシナリオを再現するテスト（`test_sort_by_assistant_type_alias`）を追加し、curlでの直接確認も実施した。

### 3. `name`空文字の扱い（🟡 注意）→ 対応済み

移植元`AssistantUpdateRequest.isNameNotBlankWhenPresent()`は`name == null || name.isEmpty()`の場合に`true`（許可）を返し、空白のみの非空文字列だけを拒否する。Pythonの`_validate_name`は`not value.strip()`で判定していたため、空文字`""`も拒否され422になっていた。空文字は「変更なし」として許可するよう修正。

### 4. `description`/`iconColor`空文字での消去（🟡 注意）→ 対応済み

移植元`AssistantService.update()`は`StringUtils.isNotBlank(...)`の場合のみ値を上書きするため、空文字・空白のみを送っても既存の値は変更されない（＝Java版では一度設定した`description`をupdateで空にする手段がない）。Python版は`is not None`のみで判定していたため、空文字を送ると意図せず値が消去されていた。`description`・`iconColor`ともに、非空白の場合のみ更新するよう修正し、テスト（`test_update_with_empty_description_keeps_existing_description`）を追加。

### 5. エンドポイントID重複時の未処理500（🟡 注意）→ 対応済み

`_resolve_endpoint_types`の既存チェック（`len(endpoint_type_map) != len(set(ids))`）はID実在確認のみで、同一IDが複数回指定された場合はすり抜けていた。その後`AssistantEndpointRepository.replace_endpoints_for_assistant`が複合PK`(assistant_id, endpoint_id)`へ重複INSERTを試み、未処理の`IntegrityError`（500）になる経路があった。IDリスト内の重複を明示的に400として弾くチェックを追加し、テスト（`test_update_with_duplicate_endpoint_ids_returns_400`）を追加。

### 6〜7. 型ヒント欠落・未使用メソッド（🔵 提案）→ 対応済み

`_to_get_response`の`endpoints_map`・`categories_map`引数に具体的なジェネリック型（`dict[str, list[AssistantEndpointItemResponse]]`・`dict[str, list[AssistantCategory]]`）を付与（CLAUDE.mdの型ヒント必須ルールに準拠）。また、どこからも呼ばれていない`AssistantEndpointRepository.find_by_assistant_id_and_tenant_id`を削除した。

### 8〜10. 既存パターンとの重複（🔵 提案）→ 対応しない

`sort`パース・`_is_tenant_admin`相当の判定・「全削除→バルクINSERT」パターン・レスポンス組み立て時の再クエリは、いずれも既存コード（`group_service.py`・`group_prompt_template_repository.py`等）の書き方をそのまま踏襲したものであり、本チケットのスコープでの重複解消（共通ヘルパー抽出）は見送る。理由: これらの重複は本チケット固有のものではなく、Group/PromptTemplate/AssistantCategoryの各ドメイン移植時から蓄積してきた既存のプロジェクト全体のパターンであり、一ドメインの実装の中で抽象化を先取りすると、他ドメインとの整合が取れないまま部分的なリファクタになってしまう。共通化するなら別チケットでGroup/PromptTemplate/Assistant横断で一括対応すべき内容と判断した。

`_build_responses`の再クエリ（カテゴリ・グループを一度メモリ上で解決した後、コミット後に`_build_responses`で再取得している点）も、単一アシスタントに対する数クエリの追加コストであり、複雑化するコストに見合わないため見送る。

### 11. `PagedResponse[T]`未導入（🔵 提案）→ 対応しない

CLAUDE.mdに記載の共通ジェネリック`PagedResponse[T]`（`content`/`totalElements`/`number`/`size`）はまだ実装されておらず、既存の`PagedGroupMemberResponse`もこの手書きパターンを踏襲している。本チケットの`PagedAssistantResponse`もこの既存パターンに合わせており、フィールド構成はCLAUDE.mdの仕様通り。共通ジェネリックの導入は横断的な変更になるため、既存の`GroupListPageResponse`（`data`/`total`/`page`/`size`という別形式）を含めた統一を別チケットで検討する。

### 12. Assistant管理API全体がグループ管理者にも開かれている（🔵 提案）→ 対応しない（意図的）

Group/PromptTemplate管理APIは作成・更新・削除を`require_admin`（テナント管理者専用）に絞り、一覧のみグループ管理者にも許可する設計。一方Assistant管理APIは、`docs/issue-42/03_詳細設計.md`に記載の通り、移植元`AdminAuthorizationFilter`（`/api/admin/**`全体をテナント管理者またはグループ管理者に許可し、`AssistantController`側は個々のメソッドで追加の`assertTenantAdmin()`を呼んでいない）を意図的に忠実移植したもの。Group側で個別に`assertTenantAdmin()`を呼んでいるのとは対照的だが、これは移植元の設計差であり、本チケットでAssistant側だけをGroup側の権限モデルに合わせて変更するのはスコープ外と判断した。この非対称性自体は`03_詳細設計.md`の権限設計セクションに明記済み。
