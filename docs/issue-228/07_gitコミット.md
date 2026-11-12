# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメントを作成 | `docs/issue-228/00`〜`07` |
| 2 | エラー応答を移植元の形・ステータスに揃える | `backend/app/core/errors.py`、`backend/app/main.py`、`backend/app/schemas/*.py`、`backend/app/services/tenant_service.py`、`backend/.claude/CLAUDE.md`、`backend/tests/**` |
| 3 | 動作確認結果を記録 | `docs/issue-228/06_タスクリスト.md`、`docs/issue-228/08_動作確認.md` |
| 4 | code-review 結果を記録（指摘対応があれば併せて） | `docs/issue-228/code-review.md` ほか |

## 各コミットメッセージ案

```
#228 issue-228 エラー応答を移植元に揃える設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#228 issue-228 エラー応答を移植元と同じ{timestamp, message}にし入力チェックのエラーを400にする
    - 移植元APIControllerAdvice相当の例外ハンドラを追加しHTTPExceptionのdetailをmessageに変換する
    - 入力チェックのエラーは422ではなく400で最初の1件のメッセージだけを返す
    - 既存テストの422/detailの確認を400/messageに書き換える
    - backendの規約にエラー応答の規約を追記する
```

```
#228 issue-228 動作確認結果を記録
    - 08_動作確認.mdにpytest・mypy・ruffの結果を記録
```
