# code-review 結果

`/code-review`（medium effort, 8観点 × 独立ファインダーエージェント）を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/app/schemas/tenant.py` | `TenantAdminPatchRequest.tenantName`に`max_length`制約がなく、DB列（VARCHAR(32)）を超える値を送るとDB制約違反による500になる | 対応済み |
| 2 | 🟡 注意 | `backend/app/services/tenant_service.py` | PATCH時、有効なサブスクリプション+プランが「上限チェック」と「レスポンス組み立て」の2箇所で重複して取得されていた | 対応済み |
| 3 | 🔵 提案 | `backend/app/services/tenant_service.py` | `_build_response`内のリソース取得とサブスクリプション取得が逐次awaitになっている | 対応しない（詳細は下記） |
| 4 | 🔵 提案 | `backend/app/services/tenant_service.py` | `tenantName`更新判定に、スキーマ側バリデータで既に保証済みの`is not None`チェックが残っており、意図が読み取りにくい | 対応済み |
| 5 | 🔵 提案 | `backend/app/services/tenant_service.py` | 永続化要否を判定する`updated`という独立したbool変数が、if分岐の結果を再度言い換えているだけだった | 対応済み |
| 6 | 🟡 注意 | `backend/app/services/tenant_service.py` / `backend/app/services/credit_usage_service.py` | 「有効なサブスクリプション+プランを解決し、請求サイクルを計算し、トークン利用量を集計する」というロジックが2つのserviceに重複している | 対応しない（詳細は下記） |
| 7 | 🔵 提案 | `backend/app/schemas/tenant.py` | `_validate_tenant_name_not_null_when_present`にdocstringがなく、他のvalidatorの慣習と異なっていた | 対応済み |
| 8 | 🟡 注意 | `backend/app/schemas/tenant.py` | `tenantName: null`を422で拒否する挙動は、チケット本文・要件定義に明記がなく、移植元Java（`tenant.setTenantName(null)`を無条件に呼び、DB制約違反で暗黙に失敗する＝実質500）とも異なる独自追加の振る舞いだった | 対応しない（意図的な設計判断として維持、詳細は下記） |

## 詳細

### 1. `tenantName`にDB列長の上限バリデーションがなかった（🟡）→ 対応済み

`Tenant.name`は`VARCHAR(32)`（`backend/app/models/tenant.py`）だが、`TenantAdminPatchRequest.tenantName`には長さ制約がなかった。33文字以上の`tenantName`を送ると、Pydanticのバリデーションは通過し、`TenantRepository.update`のコミット時にDB制約違反で失敗し、ハンドルされない500になる。

`schemas/tenant.py`で`tenantName: str | None = Field(default=None, max_length=32)`とし、33文字の`tenantName`を送ると422になることをテスト（`test_patch_returns_422_for_too_long_tenant_name`）で確認した。

### 2. 有効なサブスクリプション+プランの重複取得（🟡）→ 対応済み

`patch_admin_tenant`で`maxUsageBasedCreditsPerMonth`を更新する際、`_assert_new_max_usage_based_credits_not_below_current_usage`が内部で`SubscriptionRepository.find_active_by_tenant_id_with_plan`を呼び出し、その直後に呼ばれる`_build_response`が同じ問い合わせを再度実行していた。PATCHごとに不要なDB往復が1回発生していた。

`patch_admin_tenant`側で一度だけ解決し、`ActiveSubscriptionAndPlan`型の結果を`_assert_new_max_usage_based_credits_not_below_current_usage`と`_build_response`の両方に引数として渡すよう変更した。`_build_response`は`active`が未指定（`None`）の場合のみ自前で解決するようにし、GET（`get_tenant_detail_response`）からの呼び出しは従来どおり1回の問い合わせで完結する。

### 3. `_build_response`内の逐次await（🔵）→ 対応しない

リソース取得とサブスクリプション取得を`asyncio.gather`で並行化する提案があったが、SQLAlchemyの`AsyncSession`は単一コルーチンからの逐次利用を前提としており、同一セッションに対して複数クエリを並行実行すると`IllegalStateChangeError`等の実行時エラーやクエリの意図しない競合を招く。実際に一度`asyncio.gather`を適用してみたが、この制約に反するため取り下げ、逐次awaitに戻した。コード上にその理由をコメントで明記した。

### 4. `tenantName`更新判定の`is not None`チェック（🔵）→ 対応済み

`TenantAdminPatchRequest`の`model_validator`が、`tenantName`キー送信時に値が`null`なら422で弾くため、サービス側の`request.tenantName is not None`は実行時には常に真となる到達不能に近い条件だった。素朴に条件を削除するとmypyが`str | None`から`str`への代入を型エラーとして検出するため、`assert request.tenantName is not None`とコメントに置き換え、「なぜこの時点でstr確定なのか」を明示した。

### 5. `updated`フラグの簡素化（🔵）→ 対応済み

永続化要否の判定に使っていた`updated`bool変数は、直前のif分岐の結果を単に再言明していただけだった。`fields_set`（送られたキーの集合）が空でなければ何らかの更新が発生している、という条件に置き換え、`if fields_set:`で永続化要否を判定するよう簡素化した。

### 6. 請求期間解決ロジックの`credit_usage_service.py`との重複（🟡）→ 対応しない

`_assert_new_max_usage_based_credits_not_below_current_usage`は「有効なサブスクリプション+プランを取得し、請求サイクルの起算日を算出し、トークン利用量を集計する」という一連の処理を行うが、これは`credit_usage_service.py`の`_resolve_active_billing_period`とほぼ同じ形をしている。

このリポジトリの規約（`backend/.claude/CLAUDE.md`）では「`xxx_service.py`が別の`yyy_service.py`を呼ぶ構造は禁止」となっており、共通化するには`app/core/`または`app/repositories/`層にこのロジックを抽出する必要がある。今回のIssue #74のスコープは「テナント情報取得・部分更新API」であり、共通ヘルパーの抽出は影響範囲がクレジット利用状況API（Issue #73の成果）にも及ぶため、スコープ外として本Issueでは対応しない。将来的にクレジット関連ロジックを追加する際に、このタイミングで`app/core/`層への抽出を検討することが望ましい旨をここに記録しておく。

### 7. validatorのdocstring欠如（🔵）→ 対応済み

`_validate_tenant_name_not_null_when_present`に、他のフィールドバリデータ（`app/schemas/assistant.py`等）と同様の一行docstringを追加した。

### 8. `tenantName: null`を422で拒否する挙動の独自性（🟡）→ 対応しない

移植元Java（`TenantUpdateRequest`/`TenantService#updateTenantDetailsCore`）は`tenantName`に`null`が来ても素通りさせ、`tenant.setTenantName(null)`を呼んだ結果、DBのNOT NULL制約違反で失敗する（実質500）。チケット本文・`01_要件定義.md`にも、この場合の挙動について明記はない。

今回の実装では、この「未定義だが実質クラッシュする」Java側の挙動をそのまま再現するのではなく、Pydanticの`model_validator`で明示的に422を返すよう設計した。理由は次の2点。

- クライアントに原因不明の500ではなく、原因が特定できる422を返すほうが、リクエスト起因のエラーとして適切に扱える
- `maxUsageBasedCreditsPerMonth`の`null`（0にリセット）とは異なり、`tenantName`の`null`にはDB制約上どのような妥当な代替値も存在しない（空文字にする、無視する、のいずれも仕様にない独自解釈になってしまう）ため、明示的に拒否するのが最も安全な選択と判断した

Java側の「クラッシュする」という未定義動作をそのまま移植することは、移植の正確性より安全性を優先すべき判断だと考え、今回は意図的にこの挙動を維持する。`test_patch_returns_422_for_null_tenant_name`でこの挙動をテストしている。
