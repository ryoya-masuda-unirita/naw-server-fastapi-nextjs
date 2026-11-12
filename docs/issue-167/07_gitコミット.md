# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | docs 作成 | `docs/issue-167/00`〜`07` |
| 2 | 実装 + テスト | `backend/app/schemas/auth.py`、`backend/tests/integration/test_auth.py`、`backend/tests/unit/test_auth_schemas.py` |
| 3 | 動作確認記録 | `docs/issue-167/06_タスクリスト.md`、`docs/issue-167/08_動作確認.md` |
| 4 | code-review 結果 | `docs/issue-167/code-review.md`（指摘修正があれば該当ファイル） |

## 各コミットメッセージ案

```
#167 issue-167 パスワード再設定のドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
```

```
#167 issue-167 パスワード再設定APIでusernameキーのログインIDを受け付ける
    - PasswordResetRequest.loginId に username の別名を追加（移植元の @JsonAlias("username") 相当）
    - username キーでの成功・403、ログインID未指定の422を確認する結合テストを追加
    - PasswordResetRequest のキー名受け付けの単体テストを追加
```

```
#167 issue-167 動作確認結果を記録
    - 08_動作確認.md に pytest 実行結果を記録
```

```
#167 issue-167 code-review 結果を記録
    - code-review.md を作成
```
