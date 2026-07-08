# code-review 結果

8観点（line-by-line scan / removed-behavior / cross-file tracer / reuse / simplification / efficiency / altitude / CLAUDE.md conventions）で並行レビューを実施し、候補を統合・検証した。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/core/room_access.py` | `can_view_room`のテナント管理者バイパスが`UserRole.ADMIN`のみで、既存コードの慣習（`core/security.py`・`group_service.py`・`prompt_template_service.py`・`assistant_service.py`は全て`(ADMIN, SYSTEM)`をテナント管理者として扱う）と不整合だった | 対応済み |
| 2 | 🔵 提案 | `backend/app/services/library_service.py` | `get_library_list`が、同PRで`core/room_access.py`に追加した`require_viewable_room`を使わず、同じ404/403判定ロジックを手書きで重複させていた | 対応済み |
| 3 | 🔵 提案 | `backend/app/repositories/library_repository.py` | 「所有 or 共有先グループ所属」の可視性判定サブクエリが`find_page`と`is_visible_to_user`に一字一句同じ形でコピペされていた | 対応済み |
| 4 | 🔵 提案 | `backend/app/repositories/share_library_repository.py`, `library_tag_mapping_repository.py` | 「対象IDに紐づく既存行を全削除し指定IDで置き換える」パターンが`share_room_repository.py`・`group_prompt_template_repository.py`と重複している | 対応しない |
| 5 | 🔵 提案 | `backend/app/repositories/library_repository.py` | `find_page`が`COUNT(*)`クエリとページングクエリを別々に発行している | 対応しない |
| 6 | — | `backend/app/routers/libraries.py` / `library_service.py` / `library_repository.py` | `tagIds`クエリパラメータが`list[uuid.UUID]`型だが`library_tag_mappings.library_tag_id`はhex文字列(str(32))のカラムであり型不一致ではないか | 誤検知（実機検証により反証） |

## 詳細

### 1. `can_view_room`のテナント管理者バイパスがADMINのみ（🟡 注意）→ 対応済み

`app/core/room_access.py`の`can_view_room`は、移植元Spring Bootの`RoomAccessService.isTenantAdmin`（`user.getRole() == User.ROLE.ADMIN`のみを見る実装）にならって`UserRole.ADMIN`のみをバイパス対象にしていた。

しかし実際にこのFastAPIリポジトリを`grep`すると、テナント管理者バイパスは`core/security.py`（189, 270行目）・`group_service.py`（25行目）・`prompt_template_service.py`（24行目）・`assistant_service.py`（438行目）の全てで`current_user.role in (UserRole.ADMIN, UserRole.SYSTEM)`という判定に統一されている。Spring Boot側の忠実な移植よりも、このFastAPIリポジトリ内で既に確立された「テナント管理者バイパスの慣習」を優先すべきと判断し、`can_view_room`も`(UserRole.ADMIN, UserRole.SYSTEM)`に修正した。

あわせて`SYSTEM`ロールユーザーがルーム所有者でなくても`GET /api/libraries/{roomId}/list`を取得できることを確認するテスト（`test_list_by_room_as_system_role`）と、`ADMIN`ロール版のテスト（`test_list_by_room_as_tenant_admin`）を追加した。

### 2. `get_library_list`が`require_viewable_room`を使わず重複実装（🔵 提案）→ 対応済み

`03_詳細設計.md`の設計どおり`require_viewable_room`（ルーム閲覧権限検証＋404/403）を`core/room_access.py`に追加したが、実装時に`get_library_list`側で同じロジックを手書きしてしまい、追加した関数が未使用のまま重複コードが残っていた。`get_library_list`を`require_viewable_room`呼び出しに置き換え、意図どおりの1本化を行った（`get_library`は取得済みの`Room`オブジェクトをそのまま`can_view_room`に渡す必要があるため、こちらは`can_view_room`の直接呼び出しのまま維持している）。

### 3. 可視性判定サブクエリの重複（🔵 提案）→ 対応済み

`library_repository.py`の`find_page`と`is_visible_to_user`で「共有先グループのメンバーとして見えるライブラリID一覧」を取得するサブクエリが同一のロジックでコピペされていた。モジュールレベルの`_visible_library_ids_subquery(tenant_id, current_user_id)`に切り出し、両メソッドから呼び出す形に統一した。

### 4. リポジトリ間の「全削除して置き換え」パターンの重複（🔵 提案）→ 対応しない

`share_library_repository.py`の`replace_groups_for_library`と`library_tag_mapping_repository.py`の`replace_tags_for_library`は、既存の`share_room_repository.py`の`replace_groups_for_share`・`group_prompt_template_repository.py`の`replace_groups_for_template`と同型の「一括DELETE + `session.add()`ループ」パターンを踏襲している。

これはバグではなく、このリポジトリで複数箇所に既に存在する意図的な設計慣習（各中間テーブルのリポジトリごとに同じ形で実装する）に合わせたものであり、`backend/.claude/CLAUDE.md`が要求するN+1回避（一括DELETE使用）の条件も満たしている。本Issueのスコープで汎用ヘルパーへの抽出を行うと、既存の3箇所（`share_room_repository.py`・`group_prompt_template_repository.py`）も含めた横断的なリファクタリングが必要になり、スコープを超えるため対応しない。

### 5. `find_page`のCOUNTクエリとページングクエリの分離（🔵 提案）→ 対応しない

`find_page`は`COUNT(*)`用のクエリとページング用のクエリを別々に発行している。既存の`library_tag_repository.py`の`find_page`・`group_repository.py`の`find_page`も同じパターンであり、このリポジトリで確立されたページネーションの実装慣習に合わせたものである。window関数化などの最適化は本Issueのスコープを超えるため対応しない。

### 6. `tagIds`のUUID/str型不一致の疑い → 誤検知（反証済み）

line-by-lineスキャンで「`tagIds: list[uuid.UUID]`型のクエリパラメータが、`library_tag_mappings.library_tag_id`（`str(32)`のhex文字列カラム）と型不一致でフィルタが機能しない、またはDBドライバでエラーになるのでは」という指摘があった。

実機検証の結果、これは誤検知だった。SQLAlchemyは`String`カラムに対して`uuid.UUID`値を比較する際、値の型に応じて`Uuid`型による型強制を行い、非ネイティブUUIDバックエンド（このリポジトリの`str(32)`カラム設計）に対しては32文字hex（ダッシュなし）形式でバインドする。実際に2件のライブラリ（片方のみタグ付与）を用意し`GET /api/libraries?tagIds=...`をエンドツーエンドで呼び出したところ、正しく1件のみに絞り込まれることを確認した（SQLログでバインドパラメータが`ebfcef5c605640c981d7af5f26992b13`のような32文字hexになっていることも確認済み）。

## 修正後の確認

```
cd backend
uv run ruff check app/ tests/
uv run pytest -q
```

```
All checks passed!
392 passed, 604 warnings in 20.30s
```
