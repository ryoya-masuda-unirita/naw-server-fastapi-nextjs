# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs 作成 | `docs/issue-168/00`〜`07` |
| 2 | 実装 + テスト | `backend/app/core/password_policy.py`、`backend/tests/unit/test_password_policy.py`、`backend/tests/integration/test_auth.py` |
| 3 | 動作確認記録 | `docs/issue-168/06_タスクリスト.md`、`docs/issue-168/08_動作確認.md` |
| 4 | code-review 結果 | `docs/issue-168/code-review.md`（指摘修正があれば該当ファイル） |

## 各コミットメッセージ案

```
#168 issue-168 パスワード複雑性ポリシー検証のドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
```

```
#168 issue-168 新パスワードの複雑性ポリシー(大文字/小文字/数字/記号)を検証する
    - verify_password_strength に空白のみ・大文字・小文字・数字・記号のチェックを追加（移植元 PasswordPolicy.validate 相当）
    - ポリシー違反メッセージを移植元の日本語に揃える
    - 16通りのフラグ組み合わせを含む単体テストとパスワード再設定APIの結合テストを追加
```

```
#168 issue-168 動作確認結果を記録
    - 08_動作確認.md に pytest 実行結果を記録
```

```
#168 issue-168 code-review 結果を記録
    - code-review.md を作成
```
