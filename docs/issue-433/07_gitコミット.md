# 07_gitコミット

| # | 内容 | 対象 |
|---|---|---|
| 1 | 設計ドキュメント（00〜02、計測つき） | `docs/issue-433/` |
| 2 | 索引のマイグレーションのテストを足す（実装前に失敗するもの） | `server/tests/integration/test_migration_issue433.py` |
| 3 | `message_contents.message_id` の索引を足す | `server/alembic/versions/`・`server/app/models/message.py` |
| 4 | 詳細設計・動作確認・code-review の結果 | `docs/issue-433/` |

注意: コミット 2 の時点では、テストが失敗する（実装前の確認のため）。
