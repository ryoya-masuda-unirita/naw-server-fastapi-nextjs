# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | マイグレーション番号015重複の解消（前提修正、着手時に先行実施済み） | `backend/alembic/versions/016_add_libraries.py` |
| 2 | `00_チケット内容.md`〜`05_テスト詳細設計.md` を作成 | `docs/issue-66/` |
| 3 | Index モデル・中間テーブルモデルを実装 | `backend/app/models/index.py` |
| 4 | Index CRUD一式（repository/schema/service/router）とマイグレーションを実装 | `backend/app/repositories/index_repository.py`, `backend/app/repositories/assistant_repository.py`, `backend/app/schemas/index.py`, `backend/app/services/index_service.py`, `backend/app/routers/indexes.py`, `backend/app/main.py`, `backend/alembic/versions/017_add_indexes.py` |
| 5 | テストを追加 | `backend/tests/integration/test_indexes.py` |
| 6 | タスクリスト・動作確認・code-review.md を更新 | `docs/issue-66/06_タスクリスト.md`, `docs/issue-66/08_動作確認.md`, `docs/issue-66/code-review.md` |

## 各コミットメッセージ案

```
#66 issue-66 マイグレーション番号015の重複を解消
```

```
#66 issue-66 docs/issue-66のドキュメント一式を作成
```

```
#66 issue-66 Indexモデル・中間テーブルモデルを実装
```

```
#66 issue-66 IndexControllerのCRUD5エンドポイントをFastAPIへ移植
```

```
#66 issue-66 Index CRUD APIのテストを追加
```
