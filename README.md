# naw-serverのfastapi化
# secuaigent-clientのnext.js化

## Codex 運用

`Codex` 用のプロジェクト運用ルールはルートの [AGENTS.md](./AGENTS.md) を参照してください。

## frontend-angular（動作確認用 Angular）

`frontend-angular/` は移植元 Angular 実装（`~/Documents/secuaigent-client`）をモノレポに取り込んだものです。React 移植（`frontend/`）が完了するまでの間、**バックエンド（FastAPI）の動作確認用フロントエンド**として使います。

- 開発サーバー: `http://localhost:4201`
- テナント付きアクセス: `http://test-tenant.localhost:4201/`

### 起動手順

```bash
# 1. DB 起動（プロジェクトルート）
docker compose up -d

# 2. バックエンド（ポート 8001）
cd backend
uv run uvicorn app.main:app --reload --port 8001

# 3. フロントエンド（ポート 4201）
cd frontend-angular
npm install
npm start
```

`proxy.conf.local.js` が `localhost:8001` を向いているため、バックエンドは **8001** で起動してください。

### secuaigent-client から再コピーする場合の設定変更

`secuaigent-client` を `frontend-angular/` にコピーしたあと、**以下の設定ファイルだけ**モノレポ向けに変更すれば動作します。アプリケーションのソースコード本体は基本的にそのまま使えます。

#### 必須（バックエンド接続・ポート）

| ファイル | 変更内容 |
|---|---|
| `proxy.conf.local.js` | `localhost:8080` → `localhost:8001` |
| `proxy.conf.dev.js` | 外部 URL / TODO → `http://localhost:8001` |
| `angular.json` | `serve.options` に `"port": 4201` を追加 |
| `src/environments/environment.development.ts` | 外部 dev URL → 相対パス `'/api'`, `''` |
| `src/environments/environment.local.ts` | コメント・ポート表記を FastAPI / 4201 向けに更新 |
| `src/environments/environment.production.ts` | 絶対 URL → `'/api'`, `'/auth'` |

#### 推奨（ドキュメント・IDE・CI）

| ファイル | 変更内容 |
|---|---|
| `README.md` | 起動手順・URL をモノレポ向けに更新 |
| `.vscode/launch.json` | `4200` → `4201` |
| `.github/workflows/deploy-dev.yml` | 無効化または削除（モノレポルートの CI で管理） |

#### 変更不要

- `package.json`
- `src/environments/environment.ts`
- アプリケーションのビジネスロジック全般

> `src/` 配下の差分は設定ではなく機能開発の遅れによるものです。再コピー時にソースを上書きするかは別途判断してください。
