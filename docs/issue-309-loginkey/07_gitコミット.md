# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs 一式 | `docs/issue-309-loginkey/` |
| 2 | 応答からログインキーを外し hasLoginKey を返す | `backend/app/schemas/user.py`・`backend/app/schemas/group.py`・`backend/app/services/user_service.py`・`backend/app/services/group_service.py`・`backend/app/routers/users.py`・テスト |

## 各コミットメッセージ案

```text
#309 issue-309 ユーザー・グループの応答でログインキーを返さず hasLoginKey を返す
    - プロフィール・ユーザー一覧は loginKey の代わりに hasLoginKey を返す
    - ユーザー作成・更新は移植元の形にし、loginKey はそのリクエストで設定したキーだけ返す
    - 作成・更新に Cache-Control: no-store を付け、プロフィールは null の項目を出さない
    - グループのメンバー一覧から loginKey を削除した
    - 触ったファイルの docstring を NumPy 形式にした
```
