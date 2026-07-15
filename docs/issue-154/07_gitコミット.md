# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-154/` |
| 2 | 管理一覧APIのページサイズ上限を1000へ緩和し、テストを追加 | `backend/app/routers/{users,assistants,prompt_templates,indexes}.py`, `backend/tests/integration/test_users.py` |

## 各コミットメッセージ案

```
#154 issue-154 docs/issue-154 のドキュメント一式を作成
    - ページサイズ上限(le=100)緩和の要件・設計・テスト方針を記録
```

```
#154 issue-154 管理一覧APIのページサイズ上限を1000へ緩和
    - users/assistants/prompt_templates/indexesの一覧APIのsizeをle=100からle=1000へ緩和
    - frontend-angularが送るsize=1000が422になっていた不整合を解消（移植元のデフォルト上限2000以内）
    - test_users.pyにsize=1000→200・size=1001→422のテストを追加
```
