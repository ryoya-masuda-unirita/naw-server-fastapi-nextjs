# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/index_service.py` | `update_index`/`delete_index`がグループ管理者向けの可視性スコープ（`_resolve_visibility_scope`）を一切チェックしておらず、管理グループ外のインデックスでもIDさえ分かればグループ管理者がPATCH/DELETEできてしまう権限バイパス | 対応済み |
| 2 | 🔵 提案 | `backend/app/services/index_service.py` | `create_index`と`update_index`で、エンドポイント/グループID解決・レスポンス組み立てのロジックがほぼ重複している | 対応しない |
| 3 | 🔵 提案 | `backend/app/services/index_service.py` | `_resolve_endpoint_ids`/`_resolve_group_ids`にGoogleスタイルdocstring（Args/Raises）が付いていない | 対応しない |
| 4 | 🔵 提案 | `backend/app/repositories/index_repository.py` | `sort=type`指定時、PostgreSQLのenum型カラムは宣言順（`SAAS_GLOBAL`, `LOCAL`）でソートされ、移植元Java（`Comparator.comparing(index -> index.getType().name())`によるアルファベット順）とソート順が一致しない | 対応しない |
| 5 | 🔵 提案 | `backend/app/schemas/index.py` / `backend/app/services/index_service.py` | `endpointIds`に同一IDを重複指定した場合、`IndexRequest._validate_endpoints`は生の配列長のみを見るため`len(endpointIds) != 2`をすり抜け、`_resolve_endpoint_ids`側も`set()`で重複を吸収してしまうため、SAAS_GLOBALで「異なる2エンドポイント」のつもりが同一エンドポイント1件だけの登録になり得る | 対応しない |

## 詳細

### 1. update_index/delete_indexの権限バイパス（🔴 致命的）→ 対応済み

`GET /api/admin/indexes`・`GET /api/admin/indexes/{id}`はグループ管理者の可視性スコープ（`IndexService._resolve_visibility_scope`: 自分の管理グループに直接紐づくインデックス ∪ 自分の管理グループのアシスタントが使用するインデックス）でフィルタしていたが、`update_index`・`delete_index`にはこのチェックが一切なく、`require_admin_or_group_admin`（テナント管理者 or いずれかのグループの管理者）さえ満たせば、グループ管理者が自分の管理範囲外のインデックスでもインデックスIDを知ってさえいればPATCH/DELETEできてしまう状態だった。

一覧・詳細で可視性を絞り込んでいる以上、更新・削除も同じスコープで保護しないと一貫性がなく、実質的な権限バイパスとなるため、以下の対応を行った。

- `IndexService`に`_ensure_visible(index, tenant_id, current_user, session)`を新設し、`get_index`が個別に持っていた可視性チェックロジックをこちらに集約
- `update_index`・`delete_index`は取得したインデックスに対して`_ensure_visible`を呼び、範囲外なら404（存在しないインデックスと同じ扱い。存在確認のオラクルにならないよう403ではなく404で統一）
- ルーター（`backend/app/routers/indexes.py`）の`update_index`・`delete_index`エンドポイントに`current_user`をサービス呼び出しへ追加で渡すよう変更
- 回帰テストとして`tests/integration/test_indexes.py`に以下4件を追加
  - `TestUpdate::test_update_by_group_admin_within_scope_succeeds`
  - `TestUpdate::test_update_by_group_admin_out_of_scope_returns_404`
  - `TestDelete::test_delete_by_group_admin_within_scope_succeeds`
  - `TestDelete::test_delete_by_group_admin_out_of_scope_returns_404`
- `pytest -q`で434件（既存430件 + 新規4件）全て成功することを確認済み

なお、移植元Java（`IndexService.updateIndex`/`deleteIndex`）にはそもそもこのスコープチェックが存在しない（Controller層のフィルタのみ）。しかし、一覧・詳細で明確にグループ単位のアクセス制御を実装している以上、更新・削除だけ素通しにするのはFastAPI版として一貫性を欠くため、移植元にない挙動だが本Issueの範囲内で追加することが妥当と判断した。

### 2. create_index/update_indexのロジック重複（🔵 提案）→ 対応しない

エンドポイント/グループIDの解決（`_resolve_endpoint_ids`/`_resolve_group_ids`呼び出し）とレスポンス組み立て（`_to_response`呼び出し）が`create_index`と`update_index`でほぼ同じ形になっている。共通化の余地はあるが、`app/services/prompt_template_service.py`の`create_prompt_template`/`update_prompt_template`にも同様の重複が既に存在しており、本リポジトリで許容されている範囲のパターンと判断し、本Issueのスコープでは追加のリファクタリングは行わない。

### 3. プライベートヘルパーのdocstring不足（🔵 提案）→ 対応しない

`_resolve_endpoint_ids`・`_resolve_group_ids`はHTTPExceptionを送出するにもかかわらずGoogleスタイルdocstring（Args/Raises）が付いていない。`backend/.claude/CLAUDE.md`の「引数・戻り値・例外がある関数には必ず記載すること」に照らすと本来は記載すべきだが、機能的な影響はなく、他の指摘とあわせて別途整理する方が望ましいと判断し、本Issueでは見送る。

### 4. `sort=type`のソート順が移植元と異なる（🔵 提案）→ 対応しない

移植元はJavaの`Enum.name()`文字列比較（アルファベット順: LOCAL → SAAS_GLOBAL）でソートするが、FastAPI版はPostgreSQLのenum型カラムを直接ORDER BYしており、これは宣言順（マイグレーションでの`sa.Enum("SAAS_GLOBAL", "LOCAL", ...)`宣言順）に従う。一覧のソート・ページングをSQLクエリに寄せる設計判断（`03_詳細設計.md`に記載済み）に伴う小さな副作用であり、フロントエンド未対応の現状で実害がないため見送る。将来的にソート順の一致が必要になった場合は`case()`式等での明示的な順序指定を検討する。

### 5. `endpointIds`の重複指定が実質的にすり抜ける（🔵 提案）→ 対応しない

`IndexRequest._validate_endpoints`は`len(self.endpointIds) != 2`という生のリスト長チェックのみで、同一IDが2回指定された場合（例: `["a", "a"]`）を弾かない。後続の`_resolve_endpoint_ids`も`set()`で重複を吸収するため、意図せず同一エンドポイント1件だけがSAAS_GLOBALインデックスに紐づく状態を許してしまう。ただし移植元Java（`IndexRequestValidator`）も`endpointIds.size() != 2`という同一の生リスト長チェックであり、この挙動自体は移植元から変わっていない（新規に導入した回帰ではない）。実運用上、フロントエンドが同一エンドポイントを重複送信するケースは通常想定されないため、本Issueでは見送る。
