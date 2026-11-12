# code-review 結果

PR #223 に対して `/code-review` を実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `CLAUDE.md`・`AGENTS.md`・`README.md` | テナント識別の「現状」の説明が誤り。`GET /api/auth` も `X-Tenant-ID` 必須で、レスポンスに `tenant_id` もない | 対応済み |
| 2 | 🟡 注意 | `.github/workflows/deploy-frontend.yml` | React ではログインできないため、配信を切り替えると dev 環境で認証が必要な画面が使えなくなる | 対応しない（明記済み） |
| 3 | 🟡 注意 | `infra/cloudfront.tf` | 405 → index.html（200）で、API の本物の 405 も HTML に置き換わる | 対応しない（明記済み） |
| 4 | 🔵 提案 | `infra/cloudfront.tf` | `/auth/login` の画面表示が ALB 経由になり、backend 停止中は表示されない | 対応しない |
| 5 | 🔵 提案 | `frontend/.env` | git 管理の `.env` が 8000 のままで backend の 8001 と食い違う | 対応しない |
| 6 | 🔵 提案 | `docker-compose.yml` | compose の backend に `CORS_ALLOWED_ORIGINS` がなく、`backend/.env` がないとクロスオリジンで弾かれる | 対応しない |
| 7 | 🔵 提案 | `.github/workflows/deploy.yml` | 変更検知 `frontend/**` が広く、ドキュメント変更でもデプロイが走る | 対応しない |
| 8 | 🟡 注意 | `.github/workflows/deploy-frontend.yml` | `index.html` に Cache-Control がなく、古い index.html のブラウザが削除済み asset を読みに行く可能性 | 対応しない（既存の挙動） |
| 9 | 🔵 提案 | `.github/workflows/deploy-frontend.yml` | 配信前に lint・テストのゲートがない | 対応済み |

## 詳細

### 1. テナント識別の「現状」の説明が誤り（🔴 致命的）→ 対応済み

「ログイン後に `GET /api/auth` で得た `tenant_id` を `X-Tenant-ID` に使う作り」と書いていたが、`backend/app/routers/auth.py` の `get_auth` も `X-Tenant-ID: str = Header(...)` を要求し、`AuthResponse` に `tenant_id` フィールドもない。React の `ensureInitialized`・ログイン後のセッション取得はヘッダなしで送るため、`TENANT_ID` は保存されない。このまま入力欄だけを移植すると、セッション復元が壊れたまま残る。作業指示の「React 側の現状を確認して正確に書く」に反するため、致命的として修正した。

- `CLAUDE.md`・`AGENTS.md` のテナント識別の表: `POST /auth/login`・`GET /api/auth` とも `X-Tenant-ID` 必須で、レスポンスに `tenant_id` もなく流れが成り立たないこと、必要な修正（入力欄の移植と、入力したテナントIDを `sessionStorage` に保存してログイン・セッション取得の両方で送ること）を書いた
- `README.md`・`02_基本設計.md`・`08_動作確認.md`・PR 本文も同じ内容に直した

### 2. 配信の切り替えで dev 環境にログインできなくなる（🟡 注意）→ 対応しない

指摘のとおり、マージ後の dev 環境は React からログインできず、Angular 版で使えていた画面確認手段もなくなる。ただし、配信を React に切り替えることは Issue #213 の対応内容として、ユーザーが判断済み（2026-11-12）である。テナントID入力欄の移植はスコープ外（React の未移植画面の実装）とされている。そのため、本 PR では切り替えを行い、影響を PR 本文の「未確認事項」・`08_動作確認.md`・`CLAUDE.md`・`README.md` に明記した。マージの判断（入力欄の移植を先にするか）はレビュアーに委ねる。

### 3. 405 → index.html で API の 405 も HTML に置き換わる（🟡 注意）→ 対応しない

設計時に認識していたトレードオフで、`02_基本設計.md`・PR 本文に明記している。API の 403/404 は以前から同じ置き換えを受けており（Angular 版でも同じ）、405 だけ別の方式にしても根本的には解決しない。指摘にある CloudFront Function（GET かつ `Accept: text/html` を S3 に振り向ける）や、React のルートを `/auth/*` から外す方式は、403/404 の扱いも含めて見直すべき設計変更で、「インフラ変更は最小限」という本 Issue の方針を超える。dev 環境限定であることも踏まえ、別途の検討とする。

### 4. `/auth/login` の画面表示が ALB 経由になる（🔵 提案）→ 対応しない

backend が停止中は、そもそもログイン API が使えず、ログイン画面が出ても操作できない。dev 環境限定のため、実害は小さい。3 と同じく、根本的にはパス衝突の解消（別途検討）で解決する。

### 5. `frontend/.env` が 8000 のまま（🔵 提案）→ 対応しない

`frontend/.env` を 8001 にすると、MSW のハンドラ（`src/mocks/handlers/auth.ts` の `BASE_URL = 'http://localhost:8000'`）と既存テストの前提も変える必要があり、本 Issue（frontend-angular の削除とデプロイ切り替え）の範囲を超える。ローカル開発は README・`launch.json` で `VITE_API_URL=http://localhost:8001` を付けて起動する手順にした。

### 6. compose の backend に CORS 設定がない（🔵 提案）→ 対応しない

compose の backend は `./backend:/app` をマウントしており、README の初回セットアップで作る `backend/.env`（`.env.example` のコピー。`CORS_ALLOWED_ORIGINS=http://localhost:5173`）を読む。compose の `environment` で固定すると、開発者が `.env` で設定した値を上書きしてしまうため、追加しない。

### 7. 変更検知 `frontend/**` が広い（🔵 提案）→ 対応しない

これまでの `frontend-angular/**`・`backend/**` と同じ粒度に揃えた。ファイル単位で絞ると、ビルドに影響するファイル（設定ファイル・`.env.production` 等）を追加したときに漏れるリスクのほうが大きい。dev 環境のデプロイが余分に走るだけで、害はない。

### 8. `index.html` の Cache-Control（🟡 注意）→ 対応しない（既存の挙動）

Angular 版の `deploy-frontend-angular.yml` も同じ `aws s3 sync --delete` で、本 PR で新たに生じた問題ではない。CloudFront 側のキャッシュは invalidation で消える。ブラウザのヒューリスティックなキャッシュへの対策（`index.html` だけ `--cache-control no-cache` で上げ直す等）は、配信方式の改善として別途検討する。

### 9. 配信前の lint・テストのゲートがない（🔵 提案）→ 対応済み

`frontend/` のテストを実行する CI ワークフローはほかにないため、`deploy-frontend.yml` の `npm ci` の後に `npm run lint`・`npx vitest run` を追加した。テストが落ちる変更は、配信されずにデプロイが失敗する。ローカルではどちらも成功している（lint は exit 0、vitest は 11 ファイル・48 件すべて成功）。
