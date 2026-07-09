# code-review 結果

独立したサブエージェント（本実装の経緯を知らない立場）に、PR #89 の差分（`develop...feature/issue-86`）のレビューを依頼した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/app/routers/tenants.py` | 新規エンドポイントが`get_verified_tenant_id`（X-Tenant-IDヘッダー検証）を使わない点が、既存の`get_tenant_details`と非対称に見える | 対応しない（設計として妥当と判断） |
| 2 | 🟡 注意 | `backend/app/core/azure_cost_client.py` | `from`/`to`の一方のみ指定時、不完全な`Custom`期間でAzure APIを呼び出し、未捕捉のAzure側エラーが500として伝播しうる | 対応済み |
| 3 | 🟡 注意 | `backend/app/core/azure_cost_client.py` | レスポンス行を固定インデックス（`row[0]`〜`row[3]`）で解釈しており、列順が変わると誤った値を無言で返す危険がある | 対応済み |
| 4 | 🔵 提案 | `backend/app/core/azure_cost_client.py` | 列数不一致行を無言でスキップしており、原因調査が困難 | 対応済み |
| 5 | 🔵 提案 | `backend/app/core/azure_cost_client.py`, `backend/app/services/tenant_service.py` | Azure SDK呼び出しの例外処理（認証失敗・ネットワークエラー等）が皆無 | 対応しない（理由は詳細参照） |
| 6 | 🔵 提案 | `backend/app/core/azure_cost_client.py` | `ClientSecretCredential`/`CostManagementClient`をリクエストごとに再生成しておりオーバーヘッドがある | 対応しない（理由は詳細参照） |
| 7 | 🔵 提案 | `backend/tests/unit/test_azure_cost_client.py` | `scope`引数の組み立てを検証するテストがない | 対応済み |
| 8 | - | `backend/app/repositories/tenant_resource_repository.py` | テナント⇔リソースの紐付けチェックに情報漏洩なし | 問題なし（指摘なし） |

🔴致命的な指摘はなかった。

## 詳細

### 2. `from`/`to`の一方のみ指定時のバグ（🟡 注意）→ 対応済み

`AzureCostClient.get_cost_by_resource_id`は、`start_date`・`end_date`が共に`None`のときのみ`TheLastBillingMonth`、それ以外は常に`Custom` + `QueryTimePeriod`を組み立てていた。`from`のみ・`to`のみ指定された場合、片方が`None`のまま`Custom`タイムフレームでAzure REST APIに送信される。Azure Cost Management APIは`Custom`指定時に`from`/`to`両方必須のため、実行時にAzure側エラーが返り、本リポジトリにはグローバル例外ハンドラがないため未捕捉のまま500として利用者に伝播する。

`backend/app/services/tenant_service.py`の`query_cost`に、リソース紐付けチェックの直後・日時パースの前段で`(from_ is None) != (to is None)`のバリデーションを追加し、片方のみの指定は`HTTPException(400)`として弾くよう修正した。あわせて`backend/tests/unit/test_tenant_service.py`に`test_raises_400_when_only_from_is_specified`・`test_raises_400_when_only_to_is_specified`を追加した。

### 3. レスポンス行の列順序をハードコードで仮定（🟡 注意）→ 対応済み

`row[0]`=PreTaxCost, `row[1]`=UsageDate, `row[2]`=ResourceType, `row[3]`=Currencyという固定インデックスで解釈していたが、Azure Cost Management APIのレスポンス列順はクエリ定義（aggregation/groupingの構成）によって変わり得る。将来クエリ定義を変更した際やAPI仕様変更時に、列の意味を取り違えたまま黙って誤ったコスト値・通貨・日付を返す危険があった。

`AzureCostClient._map_rows`を新設し、レスポンスの`columns`（列メタデータ）から列名（`totalCost`, `UsageDate`, `ResourceType`, `Currency`）で位置を特定してからマッピングするよう修正した。想定する列がレスポンスに含まれない場合は`ValueError`を送出する。`backend/tests/unit/test_azure_cost_client.py`に、列順が入れ替わっても正しくマッピングできること（`test_maps_rows_regardless_of_column_order`）・想定列が欠落した場合に例外になること（`test_raises_when_expected_column_is_missing`）のテストを追加した。

### 4. 列数不一致行を無言でスキップ（🔵 提案）→ 対応済み

`_map_rows`内で、列メタデータの列数と一致しない行は`logger.warning`でログ出力した上でスキップするよう修正した（3の修正と合わせて実施）。

### 7. `scope`引数の組み立てを検証するテストがない（🔵 提案）→ 対応済み

`backend/tests/unit/test_azure_cost_client.py`に`test_builds_scope_from_settings`を追加し、`AzureCostSettings`の値から`scope`（`/subscriptions/{id}/resourceGroups/{name}`）が正しく組み立てられることを検証した。

### 1. X-Tenant-IDヘッダー未検証（🔵 提案）→ 対応しない

新規エンドポイントは`require_admin`のみを使い、`current_user.tenant_id`（JWT由来）を直接テナントIDとして使う。リクエストの`X-Tenant-ID`ヘッダーの値はどこにも参照していないため、ヘッダーを検証しなくてもテナント越境アクセスにはつながらない。同ファイル内の`tenant_endpoints.py`の`get_endpoints_by_type`と同様の「パスにtenant_idを含まないエンドポイントでは、JWTのtenant_idを信頼値として直接使う」という既存パターンに沿っており、設計として妥当と判断し対応しない。

### 5. Azure SDK呼び出しの例外処理が皆無（🔵 提案）→ 対応しない

`ClientSecretCredential`の認証失敗や`client.query.usage`のネットワークエラー・Azure側エラーを一切catchしていない。未捕捉例外はFastAPIのデフォルト500ハンドラに渡る。これは移植元Java版（`RestClientException`にのみ対応する`APIControllerAdvice`があるが、Azure SDKの認証例外自体は同様に未捕捉で500相当になる）と同等の挙動であり、本Issueのスコープ外（Azure実クレデンシャルでの動作確認自体が別Issue・別インフラ整備待ちの未確認事項として`08_動作確認.md`に明記済み）と判断し、今回は対応しない。将来Azure連携が実運用に入る段階で、502/503への変換とログ出力を別途検討する。

### 6. 認証情報・クライアントをリクエストごとに再生成（🔵 提案）→ 対応しない

`ClientSecretCredential`/`CostManagementClient`をリクエストのたびに新規生成しており、トークンキャッシュを使い回した方がオーバーヘッドを避けられる。ただし移植元Java版も同様に呼び出しごとに`CostManagementManager.authenticate`している（意図的にJava版の構造を踏襲した設計、`02_基本設計.md`参照）ため、致命的ではないパフォーマンス改善として今回は対応せず、実際のトラフィック量が判明した段階で別途検討する。
