# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-103-NAW-1096/*` |
| 2 | 管理画面ユーザー一覧からSYSTEMロールを除外する実装・テスト追加 | `backend/app/services/user_service.py`, `backend/tests/integration/test_users.py` |

## 各コミットメッセージ案

```
#103 issue-103 NAW-1096 00_チケット内容.md を作成
```

```
#103 issue-103 NAW-1096 管理画面ユーザー一覧からSYSTEMロールを除外
    - UserService.get_usersのクエリにUser.role != UserRole.SYSTEM条件を追加
    - role=SYSTEM指定時も除外条件を外さず0件になることを確認するテストを追加
    - SYSTEMロールユーザーが一覧・件数から除外されることを確認する統合テストを追加
```
