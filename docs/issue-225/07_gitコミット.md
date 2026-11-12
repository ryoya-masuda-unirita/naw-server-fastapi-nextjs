# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-225/00`〜`07` |
| 2 | 並べ替え指定の共通処理と各一覧 API への適用、不正 role の 400、SYSTEM 除外 | `backend/app/core/`・`routers/`・`services/`・`repositories/`・`backend/tests/` |
| 3 | 動作確認の記録 | `docs/issue-225/06`・`08` |
| 4 | code-review の記録と指摘対応 | `docs/issue-225/code-review.md` ほか |

## 各コミットメッセージ案

```
#225 issue-225 一覧APIの並べ替え共通化の設計ドキュメントを作成
    - 00_チケット内容.md〜07_gitコミット.md を作成
```

```
#225 issue-225 一覧APIの並べ替え指定の解釈を共通化し不正roleとSYSTEM除外を移植元に揃える
    - Spring Data の Pageable 相当の並べ替え解釈（複数指定・方向の大文字小文字無視）を core/sort.py に追加
    - 移植元で Pageable を受ける一覧 API に適用し、最終キー（ID）で同値の行の並びを確定
    - ユーザー一覧の不正な role を 400 に変更
    - チーム所属ユーザー一覧から SYSTEM 権限のユーザーを除外
```

```
#225 issue-225 動作確認結果を記録
    - 08_動作確認.md に自動テストの結果を記録
```
