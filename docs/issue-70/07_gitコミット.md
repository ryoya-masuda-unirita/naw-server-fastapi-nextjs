# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue #70 の設計ドキュメントを作成 | `docs/issue-70/*` |
| 2 | グループ×アシスタントAPIを実装 | `backend/app/routers/groups.py`, `backend/app/services/group_service.py`, `backend/app/repositories/group_assistant_repository.py`, `backend/app/schemas/group.py`, `backend/app/schemas/assistant.py` |
| 3 | グループ×アシスタントAPIの統合テストを追加 | `backend/tests/integration/test_groups.py`, `docs/issue-70/08_動作確認.md`, `docs/issue-70/code-review.md` |

## 各コミットメッセージ案

```text
#70 issue-70 設計ドキュメントを作成
    - グループ×アシスタント紐付け管理APIの要件と設計を整理
    - テスト観点とタスクを定義
```

```text
#70 issue-70 グループ×アシスタント紐付け管理APIを移植
    - 追加・削除・一覧取得エンドポイントを追加
    - グループ起点のリポジトリメソッドとサービス処理を追加
    - アシスタントレスポンスにaddedAtを追加
```

```text
#70 issue-70 グループ×アシスタント紐付け管理APIのテストを追加
    - 一覧取得・検索・フィルタ・追加・削除・権限の統合テストを追加
    - 自動テスト結果とレビュー結果を記録
```
