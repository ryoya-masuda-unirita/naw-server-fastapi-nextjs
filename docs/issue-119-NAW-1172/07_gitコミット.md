# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式（00〜08）を作成 | `docs/issue-119-NAW-1172/**` |
| 2 | `includeUsage`/`sort=totalCredits` 対応を実装 | `backend/app/core/credit_quota.py`, `backend/app/repositories/token_usage_repository.py`, `backend/app/repositories/group_user_repository.py`, `backend/app/schemas/user.py`, `backend/app/routers/users.py`, `backend/app/routers/groups.py`, `backend/app/services/user_service.py`, `backend/app/services/group_service.py`, `backend/tests/unit/test_credit_quota.py`, `backend/tests/integration/test_users.py`, `backend/tests/integration/test_groups.py` |

## 各コミットメッセージ案

```
#119 issue-119 NAW-1172 チケット対応ドキュメント一式を作成
    - 00_チケット内容.md〜08_動作確認.mdを作成
```

```
#119 issue-119 NAW-1172 ユーザー一覧・グループメンバー一覧を利用クレジット順でソート可能にする
    - GET /api/admin/users・GET /api/admin/groups/{id}/usersにincludeUsageパラメータを追加
    - includeUsage=trueの場合、有効な請求期間内のtotalCreditsをレスポンスに付与
    - sort=totalCreditsをDBクエリのORDER BYで実現し、includeUsage=falseの場合は400を返す
    - ユーザー単位のクレジット合計をIN句で一括取得しN+1を回避
    - 既存のresolve_active_billing_periodを再利用し、有効な請求期間がない場合はtotalCreditsを省略
```
