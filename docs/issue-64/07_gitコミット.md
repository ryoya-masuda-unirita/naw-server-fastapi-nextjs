# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント作成 | `docs/issue-64/*.md` |
| 2 | TokenUsage一覧・サマリ取得APIの実装 | `backend/app/models/token_usage.py`, `backend/alembic/versions/015_add_token_usages.py`, `backend/app/schemas/token_usage.py`, `backend/app/repositories/token_usage_repository.py`, `backend/app/services/token_usage_service.py`, `backend/app/routers/token_usage.py`, `backend/app/main.py` |
| 3 | テスト追加 | `backend/tests/integration/test_token_usage.py` |

## 各コミットメッセージ案

```
#64 issue-64 00_チケット内容.md〜05_テスト詳細設計.md を作成
    - TokenUsage取得APIの要件・設計・テスト設計を整理
```

```
#64 issue-64 TokenUsage（トークン消費量）一覧・サマリ取得APIを実装
    - token_usagesテーブルのmigrationとモデルを追加
    - 一覧取得(GET /api/admin/token-usages)・サマリ取得(GET /api/admin/token-usages/summary)を実装
    - 期間・ユーザー存在確認のバリデーションを追加
```

```
#64 issue-64 TokenUsage取得APIの統合テストを追加
    - 一覧・サマリ取得の正常系・異常系・権限チェックのテストを追加
```
