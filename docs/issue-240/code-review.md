# code-review 結果

PR #244 に `/code-review` を実行した結果（`docs/` 以外の差分が対象）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `infra/cloudfront.tf` | infra の apply 後、frontend の配信が終わるまでの間に古いバンドルが `POST /auth/login` を送ると S3 ビヘイビアで 403 になる | 対応しない |
| 2 | 🟡 注意 | `infra/cloudfront.tf` | React 以外のクライアントが CloudFront の `/auth/*` で認証 API を呼んでいると動かなくなる | 対応しない（該当なしを確認） |
| 3 | 🔵 提案 | `frontend/src/lib/api-client.ts` | 認証 API のベース URL が API のベース URL と独立しているため、片方だけ変えると送信先がずれる | 対応しない |
| 4 | 🟡 注意 | `infra/cloudfront_functions/spa_fallback.js` | `.` を含む画面パスは `index.html` に書き換わらない | コメントで前提を明記 |
| 5 | 🔵 提案 | `infra/cloudfront_functions/strip_backend_prefix.js` | backend が返すリダイレクトの `Location` から `/backend` が抜ける | 対応しない |
| 6 | 🔵 提案 | `frontend/src/lib/api-client.ts` | backend の全 API を `/backend/*` に揃えれば、認証 API だけの分岐が不要になる | 対応しない |
| 7 | 🟡 注意 | `frontend/.env.production` | 既存コメントが「`/api/*`・`/auth/*` を ALB へ転送」のまま | 対応済み |
| 8 | 🟡 注意 | `.github/workflows/deploy-frontend.yml` | build ステップのコメントが「`/api`・`/auth` を backend へプロキシ」のまま | 対応済み |
| 9 | 🔵 提案 | `.github/workflows/deploy-infra.yml` | CloudFront Function の単体テストが PR の CI では動かない | 対応しない |
| 10 | 🔵 提案 | `infra/cloudfront.tf` | 静的ファイルのリクエストでも毎回 SPA フォールバックの関数が実行・課金される | 対応しない |

🔴 致命的の指摘はなかった。

## 詳細

### 1. デプロイ中の古いバンドルからのログイン（🟡 注意）→ 対応しない

`deploy.yml` は infra → frontend の順に反映するため、その間（数分）古いバンドルのログイン・ログアウトが 403 になるのは事実。ただし次の理由で対応しない。

- dev 環境は現在 AWS 上に存在せず、次の反映は新規構築になる（古いバンドルが配信されている状態がない）
- dev 環境のみ（本番なし）で、移行期間の影響は再読み込みで解消する。互換のために `/auth/*` を ALB へ転送し続けると、本 Issue の目的（画面 `/auth/login` を S3 で返す）と両立しない

### 2. React 以外のクライアントからの `/auth/*`（🟡 注意）→ 対応しない（該当なしを確認）

リポジトリ内の手順・スクリプトを検索し、CloudFront 経由で `/auth/*` の API を呼んでいるものがないことを確認した（README の curl はローカルの backend を直接呼ぶ手順）。今後移植するクライアントが CloudFront 経由で認証 API を呼ぶ場合は `/backend/auth/*` を使う。転送経路は `infra/README.md`・`infra/cloudfront.tf` のコメントに書いた。

### 3. 認証 API のベース URL が独立していること（🔵 提案）→ 対応しない

移植元 Angular の `authBaseUrl` も `apiBaseUrl` と独立した設定で、本 PR はそれに合わせている。本番ビルドの値は `.env.production` で 2 つを並べて管理しており、片方だけを変える運用は想定していない。

### 4. `.` を含む画面パス（🟡 注意）→ コメントで前提を明記

移植元 Angular のルート定義（`routes.config.ts` ほか）を確認し、画面パスのパラメータは UUID・hex の ID（共有 ID も `uuid4().hex`）で `.` を含まないことを確認した。現状・移植予定の画面で問題は起きないため判定は変えず、前提と「`.` を含む画面パスを追加する場合は見直す」ことを `spa_fallback.js` のコメントに書いた。

### 5. backend のリダイレクトから `/backend` が抜けること（🔵 提案）→ 対応しない

backend の `/auth/*` は JSON を返す POST のみで、フロントは末尾 `/` を付けずに呼ぶため、backend がリダイレクトを返す経路はない。`root_path` の設定は backend の変更になり、本 Issue の範囲外。

### 6. 全 API を `/backend/*` に揃える案（🔵 提案）→ 対応しない

`/api/*` は画面パスと衝突せず、移植元どおりのパスで動いている。すべてを `/backend/*` に移すと、衝突していない API まで経路を変えることになり、変更範囲と影響が大きい。移植元が認証 API だけ別のベース URL にしている設計に合わせ、認証 API だけを分ける形を選んだ（02_基本設計.md の比較を参照）。

### 7. `.env.production` の古いコメント（🟡 注意）→ 対応済み

「`/api/*`・`/auth/*` を ALB へ転送」を「`/api/*`・`/backend/auth/*` を ALB へ転送」に直した。

### 8. `deploy-frontend.yml` の古いコメント（🟡 注意）→ 対応済み

build ステップのコメントを「`/api`・`/backend/auth` を backend へプロキシ」に直し、認証 API を `VITE_AUTH_API_URL=/backend` で呼ぶことを追記した。

### 9. CloudFront Function のテストが PR の CI で動かない（🔵 提案）→ 対応しない

このリポジトリの PR 用 CI は backend（`backend-tests.yml`）だけで、infra・frontend の検証はデプロイ時に行う運用になっている。PR 用の CI を新設するのは本 Issue の範囲外。手元では `node --test` で確認し、08_動作確認.md に結果を記録した。

### 10. 静的ファイルでも関数が実行されること（🔵 提案）→ 対応しない

CloudFront Functions の料金は 100 万回あたり 0.1 USD 程度で、dev 環境の利用量では無視できる。静的ファイル用のビヘイビアを分けるとビヘイビアとキャッシュ設定が増え、構成が複雑になる。
