# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/group_assistant_repository.py` | `find_grouped_by_group_ids`が`GroupAssistant.tenant_id`のみフィルタし、結合先`Assistant.tenant_id`を明示フィルタしていない（同ファイルの`find_page_by_group`は両方フィルタしており不整合） | 対応済み |
| 2 | 🟡 注意 | `backend/app/repositories/group_prompt_template_repository.py` | 同上。`find_grouped_by_group_ids`が結合先`PromptTemplate.tenant_id`を明示フィルタしていない | 対応済み |
| 3 | 🔵 提案 | `backend/app/services/group_service.py`（`_build_link_maps`） | アシスタント用・プロンプトテンプレート用の2クエリが逐次awaitされており、`asyncio.gather`で並行化できるのではという指摘 | 対応しない |
| 4 | 🟡 注意 | `backend/app/services/group_service.py`（`_to_list_item`） | `GroupUserRepository.find_by_group`が依然グループごとに個別クエリを発行しておりN+1のまま（本Issueで新設した`_build_link_maps`のバッチ取得パターンと対照的） | 対応しない |

## 詳細

### 1. アシスタントJOINでのテナントフィルタ欠如（🟡 注意）→ 対応済み

`find_grouped_by_group_ids`は`GroupAssistant`と`Assistant`をJOINするが、`WHERE`句には`GroupAssistant.tenant_id == tenant_id`のみが入っており、結合先`Assistant.tenant_id`のフィルタが抜けていた。同じリポジトリ内の既存メソッド`find_page_by_group`は両テーブルへ明示的にテナントフィルタをかけており、一貫性が崩れていた。

RLS（Row Level Security）によりセッションのテナントコンテキスト外の行は元々読めない設計のため実害は小さいが、コスト0で直せる整合性・多層防御の観点から`Assistant.tenant_id == tenant_id`を`WHERE`句に追加した。

```python
stmt = (
    select(GroupAssistant.group_id, Assistant.id, Assistant.name)
    .join(Assistant, Assistant.id == GroupAssistant.assistant_id)
    .where(
        GroupAssistant.group_id.in_(group_ids),
        GroupAssistant.tenant_id == tenant_id,
        Assistant.tenant_id == tenant_id,
    )
)
```

### 2. プロンプトテンプレートJOINでのテナントフィルタ欠如（🟡 注意）→ 対応済み

`GroupPromptTemplateRepository.find_grouped_by_group_ids`も同様に、結合先`PromptTemplate.tenant_id`のフィルタが抜けていた。上記と同じ理由で`PromptTemplate.tenant_id == tenant_id`を追加した。

### 3. `_build_link_maps`の2クエリ逐次await（🔵 提案）→ 対応しない

指摘としては`asyncio.gather`で2クエリを並行実行すれば高速化できるというもの。しかし、このリポジトリでは`app/services/tenant_service.py:181-182`に明記の通り「SQLAlchemyのAsyncSessionは単一コルーチンからの逐次利用が前提のため、同一sessionに対する複数クエリをasyncio.gather等で並行実行しない」という既存の設計方針がある。同一`AsyncSession`に対して`asyncio.gather`で並行クエリを発行すると`InterfaceError`等のランタイムエラーを誘発するリスクがあるため、この指摘には対応しない（最適化ではなくバグを生む変更になる）。

### 4. `GroupUserRepository.find_by_group`のN+1残存（🟡 注意）→ 対応しない

`_to_list_item`は本Issueで新設したアシスタント・プロンプトテンプレートのバッチ取得マップを受け取るようになった一方、所属ユーザー一覧の取得（`GroupUserRepository.find_by_group`）は従来通りグループごとに個別クエリを発行しており、N+1のままである。

これは本Issue着手前から存在する既存実装であり、`docs/issue-112/01_要件定義.md`の「スコープ外」に「グループ所属ユーザー一覧（`users`/`userNames`/`adminUserIds`/`adminUserNames`）の取得ロジックの変更（既存のまま。本Issueのスコープ外）」と明記した通り、意図的にスコープ外としている。ユーザー一覧のバッチ取得化は影響範囲・設計変更が本Issue（assistants/promptTemplatesの実データ配線）とは独立した別テーマであり、別Issueとして切り出すべき内容と判断し、本PRでは対応しない。
