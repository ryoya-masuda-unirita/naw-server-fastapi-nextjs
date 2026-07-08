# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | `00_チケット内容.md` を作成 | `docs/issue-56/00_チケット内容.md` |
| 2 | `01_要件定義.md`・`02_基本設計.md` を作成 | `docs/issue-56/01_要件定義.md`・`02_基本設計.md` |
| 3 | `03_詳細設計.md`〜`06_タスクリスト.md` を作成 | `docs/issue-56/03_詳細設計.md`・`04_テスト設計.md`・`05_テスト詳細設計.md`・`06_タスクリスト.md` |
| 4 | ルーム満足度評価登録・フィードバック一覧APIを実装 | `backend/app/schemas/room.py`・`backend/app/schemas/feedback.py`・`backend/app/repositories/room_repository.py`・`backend/app/services/room_service.py`・`backend/app/services/feedback_service.py`・`backend/app/routers/rooms.py`・`backend/app/routers/feedback.py` |
| 5 | ルーム満足度評価登録・フィードバック一覧APIのテストを追加 | `backend/tests/integration/test_rooms.py`・`backend/tests/integration/test_feedback.py` |
| 6 | レビュー結果を記録 | `docs/issue-56/code-review.md` |

## 各コミットメッセージ案

```
#56 issue-56 00_チケット内容.md を作成
```

```
#56 issue-56 01_要件定義.md・02_基本設計.md を作成
```

```
#56 issue-56 03_詳細設計.md〜06_タスクリスト.md を作成
```

```
#56 issue-56 ルーム満足度評価登録・フィードバック一覧APIを実装
    - POST /api/rooms/{roomId}/feedback を追加
    - GET /api/admin/feedbackRoom を追加
```

```
#56 issue-56 ルーム満足度評価登録・フィードバック一覧APIのテストを追加
```

```
#56 issue-56 レビュー結果を記録
```
