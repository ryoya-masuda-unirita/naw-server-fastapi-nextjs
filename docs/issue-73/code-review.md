# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/app/models/plan.py` | `max_credits_per_month`をNULL許容にしているが、移植元DBスキーマはNOT NULL制約 | 対応しない |
| 2 | 🔵 提案 | `backend/app/models/subscription.py` | docstringに誤字（「テナット」） | 対応済み |

## 詳細

### 1. `max_credits_per_month`のNULL許容化（🔵 提案）→ 対応しない

移植元（Spring Boot）のDBスキーマ（`plans/changeset-002-rename-max-credits-per-month.xml`）では`max_credits_per_month`はNOT NULL制約だが、FastAPI側の`Plan`モデルではNULL許容にしている。

これは意図的な設計判断で、移植元Java側の`CreditUsageService.resolveCreditLimit`が`plan.getMaxCreditsPerMonth() == null`を明示的に分岐処理しており（`03_詳細設計.md`にも記載済み）、防御的コードとはいえNULLを許容する設計思想が既に存在する。FastAPI側では、将来「無制限プラン」等でNULLを意図的に使うケースに備えてNULL許容とした。

Serviceの`_resolve_credit_limit`は`plan.max_credits_per_month is None`を正しくハンドリングしており、NULL許容化による実害（例外・不整合なレスポンス）はない。DB制約レベルでの移植元との差異は許容範囲と判断し、対応しない。

### 2. docstringの誤字（🔵 提案）→ 対応済み

`backend/app/models/subscription.py`のクラスdocstringで「テナットごとの契約」となっていた誤字を「テナントごとの契約」に修正した。

## レビュー実施内容

- `/code-review`スキルの手順に基づき、独立したサブエージェントに差分全体（`git diff origin/develop...HEAD -- backend/`）のレビューを依頼した
- 特に以下の観点を重点的に確認した
  - `billing_cycle.py`の日付境界計算（無限ループ・オフバイワン・うるう年対応）
  - `credit_usage_service.py`の`now`計算のタイミング一貫性（レースコンディション）
  - `subscription_repository.py`の有効サブスクリプション判定条件（`end_date`のNULL処理・`status`比較）
  - `response_model_exclude_none=True`による空レスポンス・`creditLimit`省略の正しさ
  - 結合テストのアサーションが実際に意図した内容を検証できているか
  - 移植元Java（`SubscriptionBillingCycle`等）とPython版の計算結果の一致
- 🔴致命的・🟡注意の指摘はなし。🔵提案2件のうち1件（誤字）を修正、1件（NULL許容化）は意図的な設計判断のため対応しないこととした
