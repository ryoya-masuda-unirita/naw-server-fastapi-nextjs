# server-local

SECURE アシスタント用のローカルサーバー。移植元 `secuaigent/secuaigent-server-local`（Spring Boot 3.2.3 / H2 + Liquibase）を Python（FastAPI）に移植したもの（Issue #210）。

顧客側の環境に置き、ブラウザ（NAW の画面）から直接呼ばれる。質問を受けて Waha! のジョブを実行し、回答を SSE で返す。学習データ（インデックスのファイル）とライブラリ本文もここで管理する。

- 動作環境: Linux（Docker コンテナ）。Windows 向けの配布はしない
- DB: SQLite（ファイル 1 つ。コンテナでは `/app/data/nawdb.sqlite3`）。起動時に Alembic でマイグレーションを適用する
- API のパス・リクエスト/レスポンス形式・SSE の形式・認証ヘッダー（`X-SERVER-AUTH-KEY`）は移植元と同じ。対応表は [docs/issue-210/02_基本設計.md](../docs/issue-210/02_基本設計.md)
- `backend/` とは独立したプロジェクトで、コードは共有しない

## Docker で起動する

```bash
cd server-local
cp .env.example .env          # SECURITY_SERVER_AUTH_KEY・WAHA_URL・WAHA_AUTHKEY・NAW_BASE_URL を設定する
mkdir -p data/stream-output   # 先に作っておく（Docker に作らせると root 所有になり書き込めない）
docker compose up -d --build
curl http://localhost:8090/api/hello   # → APIサーバは稼働中です。
```

停止・削除:

```bash
docker compose down
```

- 公開ポートは `SERVER_LOCAL_PORT`（既定 8090）。コンテナ内は 8080
- データ（SQLite・ストリームファイル）はホストの `SERVER_LOCAL_DATA_DIR`（既定 `./data`）に置く。コンテナは `SERVER_LOCAL_UID`/`SERVER_LOCAL_GID`（既定 1000）で動くので、ホストのディレクトリの所有者と揃える
- Linux でホスト上の Waha! を呼ぶ場合は `WAHA_URL=http://host.docker.internal/`（compose で `host-gateway` を設定済み）

### Waha! とストリームファイルの共有

SSE（`POST /api/messages/content`）では、Waha! がストリームファイル（推論途中経過）を書き込み、このサーバーがそれを読んでブラウザへ中継する。そのため Waha! からもストリームファイルの出力先が見える必要がある。

- このサーバーは `textData.json` と `execute` の `streamfilepath` に、コンテナ内のパス（`/app/data/stream-output/{ID}.txt`）を渡す
- Waha! が別のパスで同じディレクトリを見ている場合（ホスト上の Waha! がホストの `./data/stream-output` を見る等）は、`STREAM_WAHA_OUTPUT_DIR` に Waha! から見たディレクトリを設定する（例: `/opt/server-local/data/stream-output`）。ファイル名はそのまま
- ストリームファイルが共有できていなくても、回答は Waha! の outputfile から確定する（推論途中経過が表示されないだけ）

## 環境変数

| 環境変数 | 既定値 | 移植元の設定 | 説明 |
|---|---|---|---|
| `SECURITY_SERVER_AUTH_KEY` | なし（必須） | `security.server-auth-key` | `X-SERVER-AUTH-KEY` と照合する認証キー |
| `WAHA_URL` | `http://localhost/` | `waha.url` | 末尾 `/` 付き |
| `WAHA_AUTHKEY` | 空 | `waha.authkey` | |
| `NAW_BASE_URL` | 空 | `naw.base-url` | ライブラリのスタブ作成・タイトル更新で呼ぶ NAW の origin |
| `CONTEXT_PATH` | 空 | （Tomcat の war 名） | 例 `/secuaigent`。この配下で API を公開する |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/nawdb.sqlite3` | `spring.datasource.url` | コンテナでは `/app/data/nawdb.sqlite3` |
| `STREAM_OUTPUT_DIR` | `./data/stream-output` | `stream.output-dir` | コンテナでは `/app/data/stream-output` |
| `STREAM_WAHA_OUTPUT_DIR` | 未設定 | なし | Waha! から見た出力先（上記参照） |
| `STREAM_TAIL_POLL_INTERVAL_MS` | 200 | `stream.tail-poll-interval-ms` | |
| `STREAM_RESULT_POLL_INTERVAL_MS` | 2000 | `stream.result-poll-interval-ms` | |
| `STREAM_EMITTER_TIMEOUT_MS` | 600000 | `stream.emitter-timeout-ms` | |
| `STREAM_ORPHAN_CLEANUP_MAX_AGE_HOURS` | 24 | `stream.orphan-cleanup-max-age-hours` | 1 時間ごとに古いストリームファイルを削除する |
| `WAHA_RESULT_RETRY_INTERVAL_MS` / `WAHA_RESULT_MAX_RETRIES` | 2000 / 10 | 定数 | Waha! のジョブ完了待ちの間隔と回数 |
| `LOG_LEVEL` | `INFO` | `logging.level.root` | |
| `TZ` | `Asia/Tokyo`（compose） | JVM のタイムゾーン | 学習ファイル一覧の更新日（`yyyy-MM-dd`）をこのタイムゾーンの 0 時として解釈する |

## ローカルで開発する

```bash
cd server-local
uv sync
cp .env.example .env   # SECURITY_SERVER_AUTH_KEY などを設定
uv run alembic upgrade head
uv run uvicorn app.main:app_factory --factory --reload --port 8090

uv run pytest          # 外部連携（Waha!・NAW）はモック、DB は一時 SQLite
uv run ruff check . && uv run ruff format --check .
```

## 移植元との違い

- DB は H2 ではなく SQLite。H2 の Web コンソール（`/h2-console`）は提供しない
- 稼働確認 API（`/api/hello`）の認証除外は、移植元がハードコードしていた `/secuaigent` ではなく `CONTEXT_PATH` に追従する
- 移植元でハンドラー未定義のため 500 になり得た入力不備（質問の対象未指定・追加学習の指定不備・学習ファイルの未添付・不正な日付）は 400 で返す
- 必須ヘッダー・パラメーターの欠落は FastAPI 既定の 422 ではなく、Spring と同じ 400（`{"timestamp","status","error","path"}`）で返す
- 学習ファイルの表示名検索は、H2 の `LIKE` と同じく大文字小文字を区別する部分一致
