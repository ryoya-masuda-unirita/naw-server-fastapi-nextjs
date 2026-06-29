# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `backend/app/models/tenant.py:57`<br>`backend/app/models/user.py:54` | `updated_at` に `onupdate` がなく UPDATE 時に自動更新されない | 対応済み |
| 2 | 🔴 致命的 | `backend/app/models/tenant.py:45` | `pw_policy_valid_symbols` に `sa_column` がなく `server_default` がテストスキーマに反映されない | 対応済み |
| 3 | 🟡 注意 | `backend/tests/conftest.py:7` | `TEST_DATABASE_URL` がハードコードされており CI 環境で使えない | 対応済み |
| 4 | 🟡 注意 | `backend/alembic/env.py:10` | モデルのトップレベルインポートが repo root 実行時に失敗する | 対応しない |
| 5 | 🟡 注意 | `backend/tests/conftest.py:19` | `create_all` と Alembic マイグレーションのスキーマ乖離 | 対応しない |
| 6 | 🔵 提案 | `backend/tests/test_models.py:11` | `FIXTURE_TENANT` / `FIXTURE_USER` が未使用のデッドコード | 対応済み |
| 7 | 🔵 提案 | `backend/tests/conftest.py:10` | `anyio_backend` フィクスチャが pytest-asyncio 環境では無効 | 対応済み |

## 詳細

### 1. `updated_at` に `onupdate` がない（🔴 致命的）→ 対応済み

`server_default=sa.func.now()` は INSERT 時のみ有効。UPDATE 時に `updated_at` が変わらないため、監査ログや「最終更新」表示が壊れる。

`sa.Column(..., onupdate=sa.func.now())` を `tenant.py` と `user.py` の `updated_at` に追加した。

### 2. `pw_policy_valid_symbols` に `server_default` がない（🔴 致命的）→ 対応済み

`Field(default=..., max_length=100)` のみでは SQLModel が `server_default` なしのカラムを生成する。テスト時の `create_all` で作られるスキーマが Alembic 実行後の本番スキーマと乖離する。

`sa_column=sa.Column(sa.String(100), nullable=False, server_default="!@#$%^&*")` に変更した。

### 3. `TEST_DATABASE_URL` がハードコード（🟡 注意）→ 対応済み

CI で別ポート・別認証情報を使う場合に環境変数が無視されてしまう。`os.getenv("TEST_DATABASE_URL", "...")` に変更した。

### 4. alembic/env.py のインポートが repo root 実行時に失敗（🟡 注意）→ 対応しない

`backend/.claude/CLAUDE.md` のコマンド例が `cd backend && alembic upgrade head` であり、`backend/` からの実行が前提。`alembic.ini` の `prepend_sys_path = .` も `backend/` からの実行を想定している。repo root からの実行はスコープ外とし、ドキュメントで担保する。

### 5. `create_all` vs Alembic のスキーマ乖離（🟡 注意）→ 対応しない

テスト全体を Alembic 実行ベースに切り替えるには conftest.py の設計を大幅変更する必要があり、今回のスコープを超える。指摘 #2 の対応（`pw_policy_valid_symbols` の `sa_column` 化）で最も重大な乖離は解消済み。今後モデルを追加する際は `sa_column` で `server_default` を明示する規約を徹底する。

### 6. `FIXTURE_TENANT` / `FIXTURE_USER` が未使用（🔵 提案）→ 対応済み

どのテストからも参照されておらず、将来誤って複数テストで使い回すと `DetachedInstanceError` が発生するリスクがある。削除した。

### 7. `anyio_backend` フィクスチャが無効（🔵 提案）→ 対応済み

`pytest-asyncio` 環境では参照されない。削除した。
