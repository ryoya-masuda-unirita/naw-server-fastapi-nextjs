# naw-serverのfastapi化

# secuaigent-clientのnext.js化

## Codex 運用

`Codex` 用のプロジェクト運用ルールはルートの [AGENTS.md](./AGENTS.md) を参照してください。

## ローカル疎通確認（frontend + backend）

React（`frontend/`）を起動し、ローカルの FastAPI バックエンドと接続して動作確認する手順。
backend の動作確認は、自動テスト（`cd backend && uv run pytest`）、または React の移植済み画面で行う。

> `secuaigent/client` のコピーだった `frontend-angular/` は Issue #213 で削除した。

### 前提


| 項目      | 値                                                                  |
| ------- | ------------------------------------------------------------------ |
| フロントエンド | `http://localhost:5173/`（Vite 開発サーバー）                                  |
| バックエンド  | `http://localhost:8001`（フロントは `VITE_API_URL` の URL を直接呼ぶ）                 |
| テナント ID | `test-tenant`（`backend/seed.sql` のシードテナント）                              |
| ログイン    | `admin` / `admin@1234`（`backend/seed.sql` のシードユーザー）                     |


> **現状の制約**: backend の `POST /auth/login` は `X-Tenant-ID` ヘッダ必須だが、React のログイン画面にはまだテナントID入力欄がない（ログイン後に `GET /api/auth` で得たテナントIDを使う作り）。入力欄を移植するまでは、React の画面からはログインできない。それまでは下の「バックエンド単体」の手順や自動テストで確認する。



### 初回セットアップ

```bash
# 1. DB 起動
docker compose up -d

# 2. バックエンドの依存関係・DB マイグレーション
cd backend
uv sync
cp .env.example .env   # 未作成の場合
alembic upgrade head

# 3. シードデータ投入
docker exec -i naw-fastapi-postgres psql -U root -d postgres < seed.sql

# 4. frontend の依存関係
cd ../frontend
npm install
```



### 起動

ターミナルを2つ使う。

```bash
# ターミナル1: バックエンド（ポート 8001）
cd backend
uv run uvicorn app.main:app --reload --port 8001
```

```bash
# ターミナル2: フロントエンド（ポート 5173）
# git 管理の frontend/.env は VITE_API_URL=http://localhost:8000 のため、環境変数で 8001 に上書きする
cd frontend
VITE_API_URL=http://localhost:8001 npm run dev
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
3. ログイン以降の確認は、ログイン画面のテナントID入力欄の移植後に行う（上記「現状の制約」を参照）

#### トラブルシュート


| 症状       | 確認すること                                                                     |
| -------- | -------------------------------------------------------------------------- |
| 接続拒否     | バックエンドが **8001** で起動しているか、`VITE_API_URL=http://localhost:8001` を付けて起動したか   |
| CORS エラー | `backend/.env` の `CORS_ALLOWED_ORIGINS` に `http://localhost:5173` が含まれているか |
| DB エラー   | `docker compose up -d` で DB が起動しているか、`alembic upgrade head` 済みか、`seed.sql` が投入済みか |
