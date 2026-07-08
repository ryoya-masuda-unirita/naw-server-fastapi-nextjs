# naw-serverのfastapi化

# secuaigent-clientのnext.js化

## Codex 運用

`Codex` 用のプロジェクト運用ルールはルートの [AGENTS.md](./AGENTS.md) を参照してください。

## frontend-angular の同期

`frontend-angular/` は `secuaigent-client`（Angular）をこのモノレポに丸ごと取り込んだもの。
コピーすると `secuaigent-client` の最新状態に上書きされるため、手動でcpせず、AI（Claude Code / Codex）に
「secuaigent-clientからfrontend-angularを最新にして」のように依頼すること。モノレポ向けの設定差分の再適用まで
自動で行われる。

## ローカル疎通確認（frontend-angular + backend）

`frontend-angular`（Angular）を起動し、ローカルの FastAPI バックエンドと接続して動作確認する手順。

### 前提


| 項目      | 値                                                    |
| ------- | ---------------------------------------------------- |
| フロントエンド | `http://test-tenant.localhost:4201/`                 |
| バックエンド  | `http://localhost:8001`（`proxy.conf.local.js` 経由で転送） |
| テナント ID | `test-tenant`（URL のサブドメインから自動解決）                     |
| ログイン    | `admin` / `admin@1234`（`backend/seed.sql` のシードユーザー）  |


> `http://localhost:4201/` ではテナント ID が解決できないため、疎通確認は **サブドメイン形式の URL** を使う。



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

# 4. frontend-angular の依存関係
cd ../frontend-angular
npm install
```

`frontend-angular/src/environments/environment.local.ts` が無い場合は作成する（`.gitignore` 対象のため手元で用意が必要）。

```typescript
export const environment = {
  production: false,
  apiBaseUrl: '/api',
  authBaseUrl: '',
  enableMock: false,
  minPasswordLength: 5,
};
```



### 起動

ターミナルを2つ使う。

```bash
# ターミナル1: バックエンド（ポート 8001）
cd backend
uv run uvicorn app.main:app --reload --port 8001
```

```bash
# ターミナル2: フロントエンド（ポート 4201）
cd frontend-angular
npm startc
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

1. `http://test-tenant.localhost:4201/` を開く
2. ログイン画面が表示されることを確認
3. `admin` / `admin@1234` でログイン
4. `/dashboard` に遷移すれば疎通成功

ログイン後、ブラウザの開発者ツール（Network タブ）で以下が **200** になることを確認する。

- `GET /api/auth`
- `GET /api/users/profile`

リロードしてもログイン画面に戻らなければ、認証 Cookie の往復も問題ない。

#### トラブルシュート


| 症状       | 確認すること                                                                     |
| -------- | -------------------------------------------------------------------------- |
| ログインできない | バックエンドが **8001** で起動しているか、`seed.sql` が投入済みか                                |
| テナントエラー  | URL が `test-tenant.localhost:4201` になっているか                                 |
| 接続拒否     | `docker compose up -d` で DB が起動しているか、`alembic upgrade head` 済みか            |
| 401 が続く  | `backend/.env` の `CORS_ALLOWED_ORIGINS` に `http://localhost:4201` が含まれているか |



<!-- push動作確認用のダミー変更 -->
