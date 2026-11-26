# server-local

顧客の社内に置く、SECURE アシスタント用のローカルサーバー（FastAPI + SQLite、Linux の Docker で動かす）。
ブラウザから質問を受け、Waha!（ユニリタの ETL 製品）のジョブを実行して、回答を SSE（サーバーからの逐次配信）で返す。学習データ（インデックスのファイル）とライブラリ本文もここで管理する。

- 移植元は `secuaigent/secuaigent-server-local`（Spring Boot 3.2.3 / H2 + Liquibase）。API のパス・リクエスト/レスポンス・SSE の形式・認証ヘッダー（`X-SERVER-AUTH-KEY`）は移植元と同じ。対応表は [docs/issue-210/02_基本設計.md](../docs/issue-210/02_基本設計.md)
- `server/` とは独立したプロジェクトで、コードは共有しない
- Windows 向けの配布はしない
- Waha! まで含めて通しで動かすなら [onprem/README.md](../onprem/README.md) が早い

## Docker で起動する

```bash
cd secuaigent-server-local
cp .env.example .env          # SECURITY_SERVER_AUTH_KEY・WAHA_URL・WAHA_AUTHKEY・NAW_BASE_URL を設定する
mkdir -p data/stream-output   # 先に作っておく（Docker に作らせると root 所有になり書き込めない）
docker compose up -d --build
curl http://localhost:8090/api/hello   # → APIサーバは稼働中です。
```

停止・削除は `docker compose down`。

- 公開ポートは `SERVER_LOCAL_PORT`（既定 8090）。コンテナ内は 8080
- データ（SQLite・ストリームファイル）はホストの `SERVER_LOCAL_DATA_DIR`（既定 `./data`）に置く
- コンテナは `SERVER_LOCAL_UID` / `SERVER_LOCAL_GID`（既定 1000）で動く。ホストのディレクトリの所有者と揃える
- Linux でホスト上の Waha! を呼ぶときは `WAHA_URL=http://host.docker.internal/`（compose で `host-gateway` を設定済み）

## ローカルで開発する

```bash
cd secuaigent-server-local
uv sync
cp .env.example .env   # SECURITY_SERVER_AUTH_KEY などを設定
uv run alembic upgrade head   # アプリと同じく環境変数・.env の DATABASE_URL に適用する
uv run uvicorn app.main:app_factory --factory --reload --port 8090

uv run pytest          # 外部連携（Waha!・NAW）はモック、DB は一時 SQLite
uv run ruff check . && uv run ruff format --check .
```

DB は SQLite（ファイル 1 つ。コンテナでは `/app/data/nawdb.sqlite3`）。起動時に Alembic でマイグレーションを適用する。

## Waha! とストリームファイルを共有する

SSE（`POST /api/messages/content`）では、Waha! がストリームファイル（推論の途中経過）を書き、このサーバーが読んでブラウザへ中継する。そのため、Waha! からもストリームファイルの出力先が見える必要がある。

- このサーバーは、`textData.json` と `execute` の `streamfilepath` に、コンテナ内のパス（`/app/data/stream-output/{ID}.txt`）を渡す
- Waha! が別のパスで同じディレクトリを見ているとき（ホスト上の Waha! がホストの `./data/stream-output` を見る、など）は、`STREAM_WAHA_OUTPUT_DIR` に Waha! から見たディレクトリを設定する（例: `/opt/server-local/data/stream-output`）。ファイル名はそのまま
- 共有できていなくても、回答は Waha! の outputfile から確定する（途中経過が表示されないだけ）

## 環境変数

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `SECURITY_SERVER_AUTH_KEY` | なし（必須） | `X-SERVER-AUTH-KEY` と照合する認証キー |
| `WAHA_URL` | `http://localhost/` | Waha! の URL（末尾 `/` 付き） |
| `WAHA_AUTHKEY` | 空 | Waha! の認証キー |
| `NAW_BASE_URL` | 空 | ライブラリのスタブ作成・タイトル更新で呼ぶ NAW の origin |
| `CONTEXT_PATH` | 空 | 例 `/secuaigent`。この配下で API を公開する |
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/nawdb.sqlite3` | コンテナでは `/app/data/nawdb.sqlite3` |
| `STREAM_OUTPUT_DIR` | `./data/stream-output` | コンテナでは `/app/data/stream-output` |
| `STREAM_WAHA_OUTPUT_DIR` | 未設定 | Waha! から見た出力先（上の節を参照） |
| `STREAM_TAIL_POLL_INTERVAL_MS` | 200 | ストリームファイルを読む間隔 |
| `STREAM_RESULT_POLL_INTERVAL_MS` | 2000 | 結果を確かめる間隔 |
| `STREAM_EMITTER_TIMEOUT_MS` | 600000 | SSE のタイムアウト |
| `STREAM_ORPHAN_CLEANUP_MAX_AGE_HOURS` | 24 | 古いストリームファイルを、1 時間ごとに削除する |
| `WAHA_RESULT_RETRY_INTERVAL_MS` / `WAHA_RESULT_MAX_RETRIES` | 2000 / 10 | Waha! のジョブ完了待ちの間隔と回数 |
| `LOG_LEVEL` | `INFO` | ログレベル（下記） |
| `TZ` | `Asia/Tokyo`（compose） | 学習ファイル一覧の更新日（`yyyy-MM-dd`）を、このタイムゾーンの 0 時として解釈する |

移植元の設定名との対応: `SECURITY_SERVER_AUTH_KEY`=`security.server-auth-key`、`WAHA_URL`=`waha.url`、`WAHA_AUTHKEY`=`waha.authkey`、`NAW_BASE_URL`=`naw.base-url`、`DATABASE_URL`=`spring.datasource.url`、`STREAM_*`=`stream.*`（例: `STREAM_OUTPUT_DIR`=`stream.output-dir`）、`LOG_LEVEL`=`logging.level.root`。`CONTEXT_PATH` は Tomcat の war 名に当たる。`WAHA_RESULT_*` は移植元では定数。

### ログについて

- レベル名は移植元と同じ（`TRACE`・`DEBUG`・`INFO`・`WARN`・`ERROR`・`FATAL`・`OFF`）で書ける。Python・uvicorn にない名前は近いレベルに読み替える（`TRACE` はアプリでは `DEBUG`、`FATAL`・`OFF` は `CRITICAL`）
- **会話の本文（質問・回答・履歴・追加のプロンプト）とアクセストークンの値は、どのレベルでもログに出さない。** 出すのは、件数・長さ・ID・ツール名・トークンの有無・添付ファイルの名前とサイズだけ
- 添付ファイルの名前は、障害の調査でどのファイルかを特定するために出す（移植元と同じ）。ファイル名に機密（案件名・顧客名など）を入れないこと
- Waha! の出力ファイルが想定した形式でないときのエラーの文言にも、入力の値を含めない
- SQL の値を出す外部ライブラリ（`aiosqlite`・`sqlalchemy.engine`）は、`DEBUG` にしても `WARNING` に固定している（NAW-1438）

## 移植元との違い

- DB は H2 ではなく SQLite。H2 の Web コンソール（`/h2-console`）は提供しない
- 稼働確認 API（`/api/hello`）の認証除外は、移植元がハードコードしていた `/secuaigent` ではなく `CONTEXT_PATH` に追従する。除外は `/api/hello` とその配下（`/api/hello/…`）だけ。`/api/helloX` のように頭だけが一致するパスは除外しない（NAW-1438）
- 移植元でハンドラー未定義のため 500 になり得た入力不備は、400 で返す。対象は次のとおり
  - 質問の対象未指定、追加学習の指定不備、学習ファイルの未添付、不正な日付
  - 学習ファイルの `name` / `userId` の未指定。移植元では Waha! への登録後に、DB の NOT NULL 制約で失敗する
  - `name` は必ず失敗するため、Waha! を呼ぶ前に返す。`userId` は移植元で更新されない列なので、新しくファイルを作るときだけ（Waha! の処理の後に）確かめる
- 必須ヘッダー・パラメーターの欠落は、FastAPI 既定の 422 ではなく、Spring と同じ 400（`{"timestamp","status","error","path"}`）で返す
- 学習ファイルの表示名検索は、H2 の `LIKE` と同じく、大文字小文字を区別する部分一致
- 学習ファイルの登録・差し替え・削除は、Waha! のジョブ（数分かかることがある）をすべて終えてから、DB を短いトランザクションで更新する（#251）
  - 移植元は 1 つのトランザクションで Waha! を待つ。SQLite は書き込みが 1 本しかできず、その間ほかの書き込み（チャットの回答保存など）が `database is locked` で失敗するため、変えた
  - Waha! が途中で失敗したときに DB を変更しない点は、移植元（ロールバック）と同じ
