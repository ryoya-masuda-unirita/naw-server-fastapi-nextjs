# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue #72 の設計ドキュメントを作成 | `docs/issue-72/*` |
| 2 | ユーザー一括インポートAPIを移植 | `backend/app/*`, `backend/alembic/versions/*`, `backend/tests/integration/*` |
| 3 | code-review結果を記録 | `docs/issue-72/code-review.md`, `docs/issue-72/06_タスクリスト.md` |

## 各コミットメッセージ案

```text
#72 issue-72 設計ドキュメントを作成
    - ユーザー一括インポートAPIの要件と設計を整理
    - 同期縮小版での移植方針を記録
```

```text
#72 issue-72 ユーザー一括インポートAPIを移植
    - 同期CSVインポート処理とジョブ永続化を追加
    - 管理者向けインポートAPIと統合テストを追加
```
