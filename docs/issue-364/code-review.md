# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `assistant_repository.py` | 管理者向けアシスタント一覧の `category` 並べ替えを変えており、スコープ外ではないか | 対応しない |
| 2 | 🟡 注意 | `assistant_category_mapping_repository.py` | カテゴリなし（NULL）の並び位置が DB 方言で異なり、テストもない | 対応しない |
| 3 | 🟡 注意 | `test_groups.py` | 種別の絞り込みと組み合わせるテストが何も除外しないデータだった | 対応済み |
| 4 | 🔵 提案 | `test_groups.py`・`test_assistants.py` | テスト用ヘルパーの重複 | 対応しない |
| 5 | 🔵 提案 | `test_assistants.py` | import の空行 | 対応しない（ruff が通る） |
| 6 | 🔵 提案 | `assistant_category_mapping_repository.py` | 相関副問い合わせの性能 | 対応しない |
| 7 | 🔵 提案 | `assistant_category_mapping_repository.py` | 列式の置き場所 | 対応しない |
| 8 | 🔵 提案 | `test_groups.py` | 先頭カテゴリ名が同名のタイのテストがない | 対応しない |

🔴 致命的は 0 件。

## 詳細

### 1. 管理者向け一覧への波及（🟡）→ 対応しない

Issue 本文が「同種の漏れがほかの一覧 API にないかも確かめる」と指示しており、その確認で見つけた同一原因の漏れ（移植元の `AssistantService.getAdminAssistants` も `category` を別名で並べる）を揃えた。判断と理由は `02_基本設計.md` に記載。PR 本文にも明記している。

### 2. NULL の並び位置（🟡）→ 対応しない

移植元（PostgreSQL）の既定の NULL の扱い（昇順で末尾）に、本番も従う。SQLite は異なるが、本番 DB の既定動作を移植元と一致させる方針で、方言ごとに固定すると PostgreSQL では移植元と異なる降順の挙動になる。テストでは NULL を含めない。`02_基本設計.md` に記載済み。

### 3. 絞り込みテスト（🟡）→ 対応済み

別種別（SECURE）のアシスタントを所属させ、`type=SAAS_CHAT` で除外されること（総件数 3）を確かめるようにした。

### 4〜8（🔵）

- 4: テストファイルごとに自己完結させる既存の流儀に合わせた。
- 5: `ruff check`・`ruff format --check` は通っている。
- 6: `assistant_category_mappings` の主キーが `(assistant_id, category_id)` で、`assistant_id` が先頭の索引になっている。追加は不要。
- 7: 既存の `PRIMARY_CATEGORY_NAME` 以外にも `assistant_category_mapping_repository` を参照する箇所があり、Assistant 関連の列式として自然なためこのまま。
- 8: 同名カテゴリは `(tenant_id, name)` の一意制約で作れず、同一の先頭カテゴリ名は複数アシスタントで共有できる点は `tie_breaker` が既存の共通処理で担保している。
