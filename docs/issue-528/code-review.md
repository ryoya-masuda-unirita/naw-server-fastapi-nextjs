# code-review 結果

`/code-review medium`（`develop` との差分）の結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `docker-compose.yml` | backend が全アドレスに公開されたまま。ログイン用データ（admin / admin@1234）と既定の署名鍵が入るため、同じネットワークから使える | 対応済み |
| 2 | 🔵 提案 | `server/.claude/CLAUDE.md` | 「`docker compose up -d` で DB を起動」が、backend・画面も起動する手順に変わった | 対応済み |
| 3 | 🔵 提案 | `onprem/README.md` | マイグレーション・seed を手で流す手順が、自動に変わったため古い | 対応済み |
| 4 | 🔵 提案 | `docker-compose.yml` | migrate と backend が同じイメージ名を同時にビルドして競合しうる | 対応しない |
| 5 | 🔵 提案 | `docker-compose.yml`（`client/`） | `client/` に `.dockerignore` がなく、ホストの `node_modules` が画面のイメージに入る | 対応しない（指摘の誤り） |
| 6 | 🔵 提案 | `docker-compose.yml` | migrate が失敗すると backend・画面が起動しないが、確認の手がかりがない | 対応済み |

## 詳細

### 1. backend の公開範囲（🔴 致命的）→ 対応済み

この compose は、ログイン用データ（`admin` / `admin@1234`、テナント `test-tenant`）を必ず入れ、署名鍵も既定値になる。8001 を全アドレスに公開すると、同じネットワークの別のマシンから、API を使える。demo の compose は 127.0.0.1 だけで、画面も 127.0.0.1 だけだった。

backend の公開を `${BACKEND_HOST:-127.0.0.1}:${BACKEND_PORT:-8001}:8000` にした。onprem の server-local は、`host.docker.internal` 経由でルートの backend を呼ぶため、`127.0.0.1` だけに公開したポートに別のコンテナから届くかを、実機（Docker Desktop）で確認した（届く）。Linux の Docker で届かないときのために、`BACKEND_HOST=0.0.0.0` を `.env.example` に書いた。

postgres（5433）・redis（6380）・localstack（4566）の公開は、今のまま（全アドレス）。この Issue の前からあるもので、手元の開発（ホストの backend から繋ぐ）の使い方を変えないため。

### 2・3. 古い手順（🔵 提案）→ 対応済み

`server/.claude/CLAUDE.md` と `onprem/README.md` の手順を、新しい compose に合わせた（DB だけの起動は `up -d postgres redis localstack`。マイグレーションと `server/seed.sql` は、compose が自動で流す）。

### 4. 同じイメージ名の同時ビルド（🔵 提案）→ 対応しない

migrate と backend は、同じ build の定義（アンカーで共有）と同じイメージ名で、Compose が同じ定義として扱う。実機で、初回の `up -d --build` が問題なく通り、migrate・backend とも同じイメージで動いた。`build` を片方だけにすると、migrate だけを起動したとき（`up migrate`）に、イメージがなくて失敗するため、今の形のままにする。

### 5. `client/` の `.dockerignore`（🔵 提案）→ 対応しない（指摘の誤り）

`client/Dockerfile.dev.dockerignore`（BuildKit は、`<Dockerfile 名>.dockerignore` を読む）に `node_modules`・`dist` などが書かれており、ホストの `node_modules` は入らない。実機で、`client/node_modules` があるマシンで画面が起動し、ログインできた。

### 6. migrate が失敗したとき（🔵 提案）→ 対応済み

README の「失敗したとき」に、`docker compose logs migrate seed` を、最初に見る手がかりとして書いた。
