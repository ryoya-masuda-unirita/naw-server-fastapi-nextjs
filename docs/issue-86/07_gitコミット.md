# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-86/*.md` |
| 2 | テナントリソースコスト取得APIを実装 | `backend/pyproject.toml`, `backend/app/core/config.py`, `backend/app/core/azure_cost_client.py`, `backend/app/repositories/tenant_resource_repository.py`, `backend/app/schemas/tenant.py`, `backend/app/services/tenant_service.py`, `backend/app/routers/tenants.py`, `backend/tests/unit/test_azure_cost_client.py`, `backend/tests/unit/test_tenant_service.py`, `backend/tests/integration/test_tenants.py` |

## 各コミットメッセージ案

```
#86 issue-86 00_チケット内容.md〜05_テスト詳細設計.md を作成
    - Issue #86の要件定義・基本設計・詳細設計・テスト設計を作成
```

```
#86 issue-86 テナントリソースコスト取得API(管理者向け)を移植
    - GET /api/admin/tenants/resources/{resourceId}/cost を追加（Azure Cost Management API経由でリソースのコストを取得）
    - Azure SDK呼び出しをcore/azure_cost_client.pyに実装（serviceが別serviceを呼ばない規約に抵触しないようcore層に配置）
    - TenantResourceRepositoryにテナントID・リソースIDの一致で1件取得するメソッドを追加
    - TenantServiceにquery_costを追加（テナント⇔リソースの紐付け検証、from/toのISO8601パース）
    - azure-identity・azure-mgmt-costmanagementを依存に追加
    - Azure SDKクライアントをモックした単体・結合テストを追加
```
