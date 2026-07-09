# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs/issue-74 のドキュメント一式を作成 | `docs/issue-74/*` |
| 2 | テナント情報取得・部分更新API(管理者向け)を移植 | `app/models/tenant_resource.py`, `alembic/versions/020_*.py`, `app/repositories/tenant_resource_repository.py`, `app/repositories/tenant_repository.py`, `app/schemas/tenant.py`, `app/services/tenant_service.py`, `app/routers/tenants.py`, `app/main.py`, `tests/integration/test_tenants.py` |

## 各コミットメッセージ案

```
#74 issue-74 docs/issue-74 のドキュメント一式を作成
    - 00_チケット内容〜07_gitコミットを作成（全自動モード、第1・第2承認省略）
```

```
#74 issue-74 テナント情報取得・部分更新API(管理者向け)を移植
    - TenantResourceモデル・マイグレーションを新規追加
    - テナント詳細取得(GET /api/admin/tenants)・部分更新(PATCH /api/admin/tenants/{tenantId})を実装
    - PATCHのキー有無判定はPydanticのmodel_fields_setで表現
    - 利用ベースクレジット上限引き下げ時の請求期間内利用量チェックを実装
    - 統合テストを追加
```
