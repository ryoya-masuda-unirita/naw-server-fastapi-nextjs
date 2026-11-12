# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-237/00`〜`07` |
| 2 | `role` 絞り込みの修正とテスト | `backend/app/repositories/group_user_repository.py`、`backend/app/services/group_service.py`、`backend/tests/integration/test_groups.py` |
| 3 | 動作確認結果 | `docs/issue-237/06_タスクリスト.md`、`08_動作確認.md` |
| 4 | code-review 結果と対応 | `docs/issue-237/code-review.md` ほか |

## 各コミットメッセージ案

```text
#237 issue-237 設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```text
#237 issue-237 チーム所属ユーザー一覧のrole絞り込みを移植元に揃える
    - 大文字小文字を区別せずにADMIN・USERを判定する
    - 未知の値では0件を返す（移植元のcb.disjunction()相当）
```

```text
#237 issue-237 code-review指摘に対応しcode-review.mdを作成
    - 未知のroleではDBに問い合わせずに空の結果を返す
    - ロールと管理者フラグの対応を対応表にまとめる
    - 大文字小文字違い・未知の値・空白のみの絞り込みのテストを追加
```

```text
#237 issue-237 動作確認結果を記録
    - 08_動作確認.mdにpytest・mypy・ruffの結果を記録
```
