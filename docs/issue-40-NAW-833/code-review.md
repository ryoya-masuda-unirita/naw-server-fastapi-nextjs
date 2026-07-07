# code-review 結果

`/code-review high` を実行（8観点 × 各最大6件の候補出しの後、重複排除・検証）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/services/assistant_category_service.py` | 同一テナント内の同名カテゴリを作成・更新する際、一意制約違反が未ハンドリングのIntegrityErrorとして伝播し500になる | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/assistant_category_service.py` | get/update/deleteで「IDとテナントIDで検索し、見つからなければ404」のロジックが3箇所に重複していた | 対応済み |
| 3 | 🟡 注意 | `backend/tests/unit/test_assistant_category_service.py` | テストヘルパー関数の引数に型ヒントが一部欠けており、backend/.claude/CLAUDE.mdの型ヒント必須ルールに反していた | 対応済み |
| 4 | 🔵 提案 | `backend/app/schemas/assistant_category.py` | `_validate_name`・`_validate_description`のdocstringがGoogleスタイル（Args/Returns/Raises）を満たしていなかった | 対応済み |
| 5 | 🔵 提案 | `backend/app/schemas/assistant_category.py` | `AssistantCategoryCreateRequest`と`AssistantCategoryUpdateRequest`が完全に同一のフィールド・バリデータ定義を重複していた | 対応済み |
| 6 | 🔵 提案 | `backend/app/schemas/assistant_category.py` / `backend/app/models/assistant_category.py` | APIバリデーションの`NAME_MAX_LENGTH`（16）とDBカラム長`Field(max_length=32)`の数値が異なる理由がコメントなしでは分かりにくい | 対応済み |

## 詳細

### 1. 重複名作成・更新時にIntegrityErrorが未ハンドリング（🔴 致命的）→ 対応済み

`AssistantCategoryRepository`に`exists_by_tenant_id_and_name`（`exclude_id`で自分自身を除外可能）を追加し、`AssistantCategoryService.create_assistant_category`・`update_assistant_category`の冒頭で事前チェックするよう修正した。既存の`UserService.create_user`（`login_id`の重複を`find_by_login_id`で事前チェックし400を返す）と同じ方針に揃えた。

重複時は`HTTPException(400, "Assistant category with name {name} already exists")`を返すようにし、ユニットテスト2件（作成・更新それぞれの重複400ケース）、統合テスト3件（作成時の重複400、更新時の重複400、更新時に自分自身の既存名のままでも400にならないこと）を追加した。

### 2. 404判定ロジックの重複（🟡 注意）→ 対応済み

`AssistantCategoryService._get_category_or_404`を追加し、`get_assistant_category`・`update_assistant_category`・`delete_assistant_category`から呼び出すよう統一した。既存の`GroupService._get_group_or_404`と同じパターン。

### 3. テストヘルパーの型ヒント欠如（🟡 注意）→ 対応済み

`test_assistant_category_service.py`の`_category(tenant_id: str, updated_user_id)`・`_save(category, session)`に型ヒント（`UUID`・`AssistantCategory`・`AsyncSession | None`）を追加した。

### 4. バリデータ関数のdocstring不足（🔵 提案）→ 対応済み

`_validate_name`・`_validate_description`にArgs/Returns/Raisesを含むGoogleスタイルのdocstringを追加した。

### 5. Create/Updateリクエストスキーマの重複（🔵 提案）→ 対応済み

共通の`_AssistantCategoryRequestBase`を新設し、`AssistantCategoryCreateRequest`・`AssistantCategoryUpdateRequest`はそれを継承するだけにした。

### 6. APIバリデーション上限とDBカラム長の数値差異（🔵 提案）→ 対応済み

`schemas/assistant_category.py`の`NAME_MAX_LENGTH`定義部と`models/assistant_category.py`の`name`フィールドの両方に、DB側は移植元Liquibase準拠で32文字・API側は移植元Java（`@Size(max=16)`）準拠で16文字という意図的な差分であることを明記するコメントを追加した。

## その他の候補（検証の結果、指摘に含めなかったもの）

- リポジトリの`create()`/`update()`が`commit()`後に`refresh()`を呼ぶのは冗長ではないかという指摘があったが、`prompt_template_service.py`など既存の兄弟実装も同じパターンであり、本PR固有の新規非効率ではないため見送った
- 一覧取得APIにページネーションがない点も指摘されたが、移植元Java（`AssistantCategoryController.getAllAssistantCategories`）自体が検索・ページネーションなしの全件取得のみであり、`02_基本設計.md`・`03_詳細設計.md`に記載済みの意図的な仕様のため対応しない
- 削除対象が存在しない場合に404を返す挙動（`group_service.py`/`prompt_template_service.py`の冪等no-opとは異なる）は、`tenant_endpoint_service.delete_endpoint`と同じ既存の分岐した慣例に従っているため、本PR単独での統一は見送った
- リポジトリに`create`/`update`という薄いラッパーメソッドを設けたことについて「新しいパターン」との指摘があったが、`password_history_repository.py`に同種の`save()`ラッパーの前例があり、既存慣例からの逸脱ではないため見送った
