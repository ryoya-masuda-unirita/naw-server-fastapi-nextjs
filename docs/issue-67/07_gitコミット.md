# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs/issue-67 の作成 | `docs/issue-67/*` |
| 2 | ローカルサーバーエンドポイント取得APIの実装 | `backend/app/schemas/tenant_endpoint.py`, `backend/app/services/tenant_endpoint_service.py`, `backend/app/routers/tenant_endpoints.py`, `backend/app/main.py` |
| 3 | テスト追加 | `backend/tests/integration/test_tenant_endpoints.py` |

## 各コミットメッセージ案

```
#67 issue-67 00_チケット内容.mdを作成
    - Issue内容・参照実装をドキュメント化
```

```
#67 issue-67 ローカルサーバーエンドポイント取得APIを実装
    - apiKeyを含むLocalServerEndpointResponseを追加
    - TenantEndpointServiceにget_local_server_endpointを追加
    - GET /api/tenants/endpoints/local/{endpointId}を新規routerで追加
```

```
#67 issue-67 ローカルサーバーエンドポイント取得APIのテストを追加
    - 正常系・タイプ不一致・存在しない・他テナント・一般ユーザーのテストケースを追加
```
