# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/repositories/assistant_endpoint_repository.py` | エンドポイント結合クエリが`TenantEndpoint.tenant_id`を絞り込んでおらず、`assistants_endpoints`と`tenant_endpoints`のtenant_idが食い違うデータが存在した場合に他テナントの接続情報が露出しうる | 対応済み |
| 2 | 🔵 提案 | `backend/app/services/assistant_service.py` | Group紐づけ取得とエンドポイント紐づけ取得の2クエリが順次実行されており、並列化（`asyncio.gather`）の余地がある | 対応しない |
| 3 | 🔵 提案 | `backend/app/services/assistant_service.py` | `xxx_by_assistant_id`のバッチ取得パターンが今後カテゴリ機能等でさらに増えると、メソッドが肥大化する懸念 | 対応しない（現時点では2件のみで可読性に問題なし） |

2件のfinderエージェントが独立に指摘1を検出した。

## 詳細

### 1. テナント分離クエリの防御的チェック漏れ（🟡 注意）→ 対応済み

`AssistantEndpointRepository.find_endpoints_grouped_by_assistant_id`のクエリは、`AssistantEndpoint.tenant_id == tenant_id`のみで絞り込んでおり、結合先の`TenantEndpoint.tenant_id`は確認していなかった。

`assistants_endpoints.endpoint_id`から`tenant_endpoints.id`へのFKは単純な参照（`tenant_endpoints`のどのテナントの行でも参照可能）であり、`assistants_endpoints.tenant_id`と結合先`tenant_endpoints.tenant_id`が一致することを保証するDB制約（複合FKやCHECK制約）は存在しない。そのため、何らかの理由で不整合なデータ（`assistants_endpoints.tenant_id`は自テナントだが`endpoint_id`が他テナントの`tenant_endpoints`行を指す）が生成された場合、他テナントの接続情報（URL・モデル種別）がレスポンスに漏れる可能性があった。

現時点ではこのデータ不整合を起こす経路は存在しない（アシスタント⇔エンドポイントの紐付けAPIは未実装で、本チケットのシードデータのみ）が、将来紐付けAPIを実装した際に確認を怠ると同じ問題が起きうるため、多層防御としてクエリに`TenantEndpoint.tenant_id == tenant_id`を追加した。回帰テスト`test_excludes_endpoint_belonging_to_different_tenant`を追加し、修正前はこのテストが失敗する（他テナントのエンドポイントが漏れる）ことを確認した上で修正・再テストを行った。

### 2. クエリの並列化余地（🔵 提案）→ 対応しない

`find_group_ids_grouped_by_assistant_id`と`find_endpoints_grouped_by_assistant_id`は互いに独立したクエリだが順次実行されている。`asyncio.gather`で並列化すればレイテンシを削減できるが、現状のデータ量（ユーザー1人あたりの所属グループ・アシスタント数）では体感できるほどの差はなく、可読性とのトレードオフを考慮し見送る。

### 3. バッチ取得パターンの将来的な肥大化懸念（🔵 提案）→ 対応しない

`groups_by_assistant_id`・`endpoints_by_assistant_id`と、アシスタントごとの関連データをバッチ取得する処理が2つ並んでいる。将来カテゴリ機能等でさらに増える場合は共通化を検討すべきだが、現時点で2件のみであれば可読性上の問題はないと判断し、見送る。
