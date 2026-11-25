# ローカル疎通確認（frontend + backend）

React（`client/`）を起動し、ローカルの FastAPI バックエンドと接続して動作確認する手順。
backend の動作確認は、自動テスト（`cd server && uv run pytest`）、または React の移植済み画面で行う。

### 前提

| 項目 | 値 |
| ------- | ------------------------------------------------------------------ |
| フロントエンド | `http://localhost:5173/`（Vite 開発サーバー） |
| バックエンド | `http://localhost:8001`（フロントは `VITE_API_URL` の URL を直接呼ぶ） |
| テナント ID | `test-tenant`（`server/seed.sql` のシードテナント） |
| ログイン | `admin` / `admin@1234`（`server/seed.sql` のシードユーザー） |

### 初回セットアップ

```bash
# 1. DB 起動（画面・backend は、ホストで直接動かすため起動しない）
docker compose up -d postgres redis localstack

# 2. バックエンドの依存関係・DB マイグレーション
cd server
uv sync
cp .env.example .env   # 未作成の場合
alembic upgrade head

# 3. シードデータ投入
docker exec -i naw-fastapi-postgres psql -U root -d postgres < seed.sql

# 4. frontend の依存関係
cd ../client
npm install
```

### 起動

ターミナルを2つ使う。

```bash
# ターミナル1: バックエンド（ポート 8001）
cd server
uv run uvicorn app.main:app --reload --port 8001
```

```bash
# ターミナル2: フロントエンド（ポート 5173）
# client/.env は git に入れない。初回だけ .env.example をコピーする（VITE_API_URL は 8001）
cd client
[ -f .env ] || cp .env.example .env
npm run dev
```

### 疎通確認

#### 1. バックエンド単体（任意）

```bash
curl -s -i -X POST http://localhost:8001/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: test-tenant" \
  -d '{"username":"admin","password":"admin@1234"}'
```

`HTTP/1.1 200 OK` と JWT / Cookie が返ればバックエンドは起動できている。

#### 2. ブラウザでフロントエンド経由

1. `http://localhost:5173/` を開く
2. ログイン画面（`/auth/login`）が表示されることを確認
3. テナント ID（`test-tenant`）・ユーザー ID・パスワード（`admin` / `admin@1234`）でログインし、管理画面が表示されることを確認

#### トラブルシュート

| 症状 | 確認すること |
| -------- | -------------------------------------------------------------------------- |
| 接続拒否 | バックエンドが **8001** で起動しているか、`client/.env` の `VITE_API_URL` が `http://localhost:8001` か |
| CORS エラー | `server/.env` の `CORS_ALLOWED_ORIGINS` に `http://localhost:5173` が含まれているか |
| DB エラー | `docker compose up -d postgres redis localstack` で DB が起動しているか、`alembic upgrade head` 済みか、`seed.sql` が投入済みか |
