# 07_gitコミット

| # | 内容 | 対象 |
|---|---|---|
| 1 | 設計ドキュメント（00〜02、計測つき） | `docs/issue-442/` |
| 2 | 索引のマイグレーションのテストを足す（実装前に失敗するもの） | `server/tests/integration/test_migration_issue442.py` |
| 3 | `messages` の `(tenant_id, room_id)` と `parent_id` の索引を足す | `server/alembic/versions/`・`server/app/models/message.py` |
| 4 | 詳細設計・動作確認・code-review の結果 | `docs/issue-442/` |
