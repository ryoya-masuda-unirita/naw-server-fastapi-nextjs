# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-73/` |
| 2 | Plan/Subscriptionドメイン・請求サイクル計算・クレジット利用状況APIを実装 | `backend/app/models/plan.py`, `backend/app/models/subscription.py`, `backend/alembic/versions/019_add_plans_and_subscriptions.py`, `backend/app/repositories/subscription_repository.py`, `backend/app/core/billing_cycle.py`, `backend/app/schemas/credit_usage.py`, `backend/app/services/credit_usage_service.py`, `backend/app/routers/credit_usage.py`, `backend/app/main.py`, `backend/seed.sql`, `backend/tests/unit/test_billing_cycle.py`, `backend/tests/integration/test_credit_usage.py` |

## 各コミットメッセージ案

```
#73 issue-73 docs/issue-73 のドキュメント一式を作成
    - 00_チケット内容〜08_動作確認を作成
```

```
#73 issue-73 クレジット利用状況ダッシュボードAPIを移植
    - Plan/Subscriptionドメインを新規追加（マイグレーション含む）
    - 請求サイクルの起算日算出ロジック(billing_cycle)を移植
    - CreditUsageService/Routerを実装しme/workspaceエンドポイントを追加
    - 既存のTokenUsageRepository.summarize・TenantRepository.find_by_idを再利用
    - 単体テスト・結合テストを追加
```
