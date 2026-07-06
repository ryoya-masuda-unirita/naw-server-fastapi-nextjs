# 07_gitコミット

## コミット分割案

### 1. ドキュメント作成（済）

```
#28 issue-28 00_チケット内容.md を作成
```

```
#28 issue-28 01_要件定義.md・02_基本設計.md を作成
```

```
#28 issue-28 03_詳細設計.md〜07_gitコミット.md を作成
```

### 2. 実装

```
#28 issue-28 テナントエンドポイント管理APIを実装
    - EndpointType・TenantEndpointモデルとマイグレーションを追加
    - TenantEndpointRepository・TenantEndpointServiceを追加（LOCAL_SERVER限定バリデーション含む）
    - core/security.pyにrequire_admin_for_tenant_pathを追加
    - GET/POST/PATCH/DELETE /api/admin/tenants/{tenantId}/endpoints系エンドポイントを追加しmain.pyに登録
```

### 3. テスト

```
#28 issue-28 テナントエンドポイント管理APIのテストを追加
    - conftest.pyのテーブルクリア対象にtenant_endpointsを追加
    - tests/integration/test_tenant_endpoints.pyにLOCAL_SERVER限定バリデーション・権限モデル・APIキー非開示のテストを追加
```

### 4. 動作確認・code-review反映（動作確認・レビュー完了後）

```
#28 issue-28 08_動作確認.md を作成
```

```
#28 issue-28 code-review指摘を修正
```

（内容は指摘に応じて調整する）

## 備考

- 全自動モードのため、実装・テスト・動作確認・PR作成・code-review・修正までを連続して実施する
- 実装中に発見した追加修正が発生した場合はコミットを分けて記録する
