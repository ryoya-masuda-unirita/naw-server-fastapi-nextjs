# 07_gitコミット

## コミット分割案

### コミット 1: docker-compose.yml の追加

```
#5 issue-5 ローカル開発用 PostgreSQL コンテナを追加
    - docker-compose.yml を作成（postgres:18、ホスト側ポート 5433）
```

対象ファイル:
- `docker-compose.yml`

---

### コミット 2: Alembic セットアップ

```
#5 issue-5 Alembic を導入し非同期マイグレーション基盤を構築
    - pyproject.toml に alembic>=1.13.0 を追加
    - alembic.ini を作成
    - alembic/env.py を作成（asyncpg 対応）
    - alembic/script.py.mako を作成
```

対象ファイル:
- `backend/pyproject.toml`
- `backend/alembic.ini`
- `backend/alembic/env.py`
- `backend/alembic/script.py.mako`

---

### コミット 3: SQLModel モデル定義

```
#5 issue-5 Tenant・User の SQLModel モデルを追加
    - app/models/tenant.py を作成
    - app/models/user.py を作成（UserRole ENUM 含む）
```

対象ファイル:
- `backend/app/models/tenant.py`
- `backend/app/models/user.py`

---

### コミット 4: 初期マイグレーション

```
#5 issue-5 tenants・users テーブルの初期マイグレーションを追加
    - alembic/versions/001_init_tenants_users.py を作成
    - CHECK 制約・インデックス・FK・UNIQUE 制約を含む
```

対象ファイル:
- `backend/alembic/versions/001_init_tenants_users.py`

---

### コミット 5: DB 接続設定

```
#5 issue-5 SQLAlchemy 非同期セッションの設定を追加
    - app/core/database.py を作成
    - get_session() を FastAPI Depends 向けに公開
```

対象ファイル:
- `backend/app/core/database.py`

---

### コミット 6: テスト追加

```
#5 issue-5 Tenant・User モデルのテストを追加
    - tests/conftest.py を作成（テスト用 DB セットアップ）
    - tests/test_models.py を作成（制約・デフォルト値の検証）
```

対象ファイル:
- `backend/tests/conftest.py`
- `backend/tests/test_models.py`
