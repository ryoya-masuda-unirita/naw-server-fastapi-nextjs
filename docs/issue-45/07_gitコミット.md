# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | Issue #45 の設計ドキュメントを更新 | `docs/issue-45/03_詳細設計.md`〜`07_gitコミット.md` |
| 2 | rooms / room_pins のマイグレーションとモデルを追加 | `backend/alembic/versions/011_add_rooms_and_room_pins.py`、`backend/app/models/room.py` |
| 3 | room の schema / repository / service / router を追加 | `backend/app/schemas/room.py`、`backend/app/repositories/room_repository.py`、`backend/app/repositories/room_pin_repository.py`、`backend/app/services/room_service.py`、`backend/app/routers/rooms.py`、`backend/app/main.py` |
| 4 | 既存アシスタント削除処理の参照制約ハンドリングを追加 | `backend/app/services/assistant_service.py` |
| 5 | rooms 関連の統合テストと回帰テストを追加 | `backend/tests/integration/test_rooms.py`、`backend/tests/integration/test_assistants.py`、必要なら `backend/tests/conftest.py` |
| 6 | 動作確認結果と残件を記録 | `docs/issue-45/06_タスクリスト.md`、`docs/issue-45/08_動作確認.md` |

## 各コミットメッセージ案

1. `#45 issue-45 詳細設計からコミット計画までのドキュメントを更新`
2. `#45 issue-45 roomsとroom_pinsのマイグレーションおよびモデルを追加`
3. `#45 issue-45 ルーム管理APIのCRUDと固定機能を実装`
4. `#45 issue-45 参照中アシスタント削除時の業務エラーハンドリングを追加`
5. `#45 issue-45 ルーム管理APIとアシスタント削除回帰のテストを追加`
6. `#45 issue-45 ルーム管理APIの動作確認結果を記録`
