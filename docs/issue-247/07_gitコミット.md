# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-247/00`〜`07` |
| 2 | 除外グループの実装とテスト | `backend/app/services/user_service.py`、`backend/tests/integration/test_users.py` |
| 3 | 動作確認の記録 | `docs/issue-247/06_タスクリスト.md`、`docs/issue-247/08_動作確認.md` |

## 各コミットメッセージ案

```text
#247 issue-247 ユーザー一覧の除外グループ対応の設計ドキュメントを作成する
    - docs/issue-247 に 00〜07 を作成
```

```text
#247 issue-247 ユーザー一覧でexcludeGroupIdの所属ユーザーを除外する
    - 移植元 UserService と同じく groups_users への NOT EXISTS で除外する
    - 存在しない・他テナントのグループ ID はエラーにせず除外もしない
    - 結合テストを追加
```

```text
#247 issue-247 動作確認結果を記録する
    - 08_動作確認.md に pytest・mypy・ruff の結果を記録
```
