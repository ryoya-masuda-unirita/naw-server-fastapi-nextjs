# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue #71 の設計ドキュメントを作成 | `docs/issue-71/*` |
| 2 | 管理者向けルーム履歴取得APIを実装 | `backend/app/routers/rooms.py`, `backend/app/main.py`, `backend/app/services/room_service.py`, `backend/app/repositories/room_repository.py`, `backend/app/schemas/room.py` |
| 3 | 管理者向けルーム履歴取得APIの統合テストを追加 | `backend/tests/integration/test_rooms.py`, `docs/issue-71/08_動作確認.md`, `docs/issue-71/code-review.md` |

## 各コミットメッセージ案

```text
#71 issue-71 設計ドキュメントを作成
    - 管理者向けルーム履歴取得APIの要件と設計を整理
    - テスト観点とタスクを定義
```

```text
#71 issue-71 管理者向けルーム履歴取得APIを移植
    - ルーム履歴一覧・詳細エンドポイントを追加
    - 管理者/グループ管理者向けの絞り込みとソートを追加
    - ルーム履歴レスポンススキーマを追加
```
