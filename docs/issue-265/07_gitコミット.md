# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-265/00`〜`07` |
| 2 | ログインの失敗回数ロックの実装とテスト | `backend/app/core/password_mismatch_store.py`、`backend/app/services/auth_service.py`、`backend/app/routers/auth.py`、`backend/tests/unit/test_password_mismatch_store.py`、`backend/tests/unit/test_auth_service.py`、`backend/tests/integration/test_auth.py` |
| 3 | 動作確認・タスクリスト更新 | `docs/issue-265/06_タスクリスト.md`、`docs/issue-265/08_動作確認.md` |
| 4 | code-review の結果 | `docs/issue-265/code-review.md`（と指摘対応） |

## 各コミットメッセージ案

```
#265 issue-265 ログイン失敗回数ロックの設計ドキュメントを追加
    - 移植元 LoginAttemptService・AuthService の数え方と応答を要件・設計に整理
```

```
#265 issue-265 ログインに失敗回数ロックを移植
    - 通算6件以上かつ2番目に新しい失敗が15分以内ならログインを429でロック
    - 失敗記録をパスワード再設定と共有し、成功するまで期間で捨てないよう変更
    - 認証失敗の応答を移植元どおり403 Authentication failedに統一
```

```
#265 issue-265 動作確認結果を記録
    - 自動テスト（pytest 全件・mypy・ruff）の結果を08に記録
```

```
#265 issue-265 code-review の結果を記録
    - 指摘と対応方針を code-review.md に記録
```
