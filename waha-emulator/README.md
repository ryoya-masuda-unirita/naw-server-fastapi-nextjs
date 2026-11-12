# waha-emulator

Waha!（ユニリタの ETL 製品）の servicerun API を真似る、Python（FastAPI）のサービス（Issue #274）。`server-local/` から SECURE アシスタントのチャットを通しで動かすために、Waha! の代わりに置く。

移植元のリポジトリには Waha! 本体がないため、API は `server-local/app/clients/waha_client.py`（移植元 `ServiceRunService` の移植）が使うものだけを、同じパス・パラメータ・応答で作っている。いまは**土台**で、ワークフローは仮のチャットだけ。生成AI・検索・埋め込みのアダプタは、後続の Issue で移植してワークフローに差し込む。

- 動作環境: Linux（Docker コンテナ）。ホストで直接動かしてもよい
- セッションはメモリに持つ（再起動で消える）
- `backend/`・`server-local/` とは独立したプロジェクトで、コードは共有しない（テストだけ `server-local/` を読み込む）
- 設計は [docs/issue-274](../docs/issue-274/)

## API

ベースパスは `WahaServer/servicerun/api`。応答はすべてテキスト。

| API | パラメータ | 応答 |
|---|---|---|
| `GET /startsession` | `authkey` | セッション ID。authkey が違えば 401 |
| `GET /endsession` | `sessionid` | `OK`。スロットのファイルを破棄し、実行中のジョブを止める |
| `POST /upload/{slot}` | `sessionid`、multipart の `file` | `OK`。入力スロット（`file`・`question`・`attachmentfile`・`history`・`textdata`）だけ受け付ける |
| `GET /execute/{serviceId}`（サービス ID が空の `/execute/` も可） | `sessionid`、ほかはワークフローに渡す（`streamfilepath`・`splitLength`・`filepath`・`start`・`end`） | 既定はジョブの完了まで待って `/result` と同じ文字列。`EXECUTE_WAIT_FOR_COMPLETION=false` ならすぐ `OK` |
| `GET /result` | `sessionid` | `RUNNING` / `SUCCESS` / `FAILURE: 理由`。execute の前は `RUNNING` |
| `GET /download/{slot}` | `sessionid` | スロットの中身（出力は `outputfile`） |

存在しないセッションは 404。

## ワークフロー

`execute` のサービス ID とパラメータで選ぶ。

1. サービス ID に登録されたワークフロー（`WorkflowRegistry.register`。アダプタを差し込むときに使う）
2. `splitLength`・`filepath` 付き → 学習（未対応の失敗）
3. `start`・`end` 付き → 学習データの同期（未対応の失敗）
4. それ以外 → 仮のチャット

仮のチャットは `question`（と `history`）を LLM に 1 回渡し、回答を `outputfile` に `{"answer": "...", "filepaths": [], "references": []}` で書く。`question` がない呼び出し（学習データの削除など）と、`textdata` の `createLibrary` が true のもの（ライブラリ生成）は未対応の失敗にする。

### ストリームファイル（途中経過）

`execute` に `streamfilepath` があれば、LLM の応答の差分ごとに次の 1 行を追記する（移植元アダプタと同じ `data:` + 1 行の JSON）。成功したら `completed`、失敗したら `error` を書く。

```
data:{"type":"text_delta","text":"差分"}
data:{"type":"completed"}
```

- ファイルは server-local が execute の前に作る。こちらは作らず、なければジョブを失敗にする（移植元アダプタと同じ）
- server-local の NAW 互換 SSE（`POST /api/messages/content`）は、ストリームファイルの `text_delta` を中継しない。回答は outputfile から確定時にまとめて表示される。逐次表示されるのは旧形式の SSE（`/api/messages/content/stream`）だけ。理由は [03_詳細設計](../docs/issue-274/03_詳細設計.md) を参照

## LLM の接続先

| `LLM_PROVIDER` | 動作 |
|---|---|
| `echo`（既定） | キー不要。質問を 8 文字ずつに区切って、そのまま回答として返す |
| `azure_openai` | Azure OpenAI の chat completions をストリーミングで呼ぶ。`AZURE_OPENAI_ENDPOINT`・`AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_DEPLOYMENT` が必須（足りなければ起動時にエラー） |

## 環境変数

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `WAHA_AUTHKEY` | なし（必須） | `startsession` の `authkey` と照合する。server-local の `WAHA_AUTHKEY` と同じ値にする |
| `EXECUTE_WAIT_FOR_COMPLETION` | `true` | `true`: execute はジョブの完了まで応答しない。`false`: すぐ応答する。server-local の同期 API・学習は execute の後に「間隔 × 回数」（既定 2 秒 × 10 回）しか結果を待たないため、`false` で LLM が遅いと失敗する |
| `STREAM_ALLOWED_DIR` | 未設定（Docker では `/app/data/stream-output`） | 設定すると `streamfilepath` をこのディレクトリの中だけに制限する。未設定だと、セッションを開ければ（authkey を知っていれば）任意の既存ファイルに追記できるため、ホストで動かすときも設定する |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `3600` | この時間使われていないセッション（実行中のジョブがないもの）を、次の `startsession` で破棄する。server-local は失敗時に `endsession` を呼ばない経路がある（学習データの同期など）ため |
| `LLM_PROVIDER` | `echo` | `echo` / `azure_openai` |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | 空 | `azure_openai` のとき必須。デプロイ名は chat completions の `model` に渡す |
| `AZURE_OPENAI_API_VERSION` | `2024-10-21` | backend と同じ既定値 |
| `LOG_LEVEL` | `INFO` | |

Docker Compose では、ほかに `WAHA_EMULATOR_PORT`（既定 8091）・`WAHA_EMULATOR_STREAM_DIR`（既定 `../server-local/data/stream-output`）・`WAHA_EMULATOR_UID`/`WAHA_EMULATOR_GID`（既定 1000）・`TZ`（既定 `Asia/Tokyo`）を使う。

## Docker で起動する

```bash
mkdir -p server-local/data/stream-output   # マウントするディレクトリを先に作る（下記）
cd waha-emulator
cp .env.example .env          # WAHA_AUTHKEY を設定する（azure_openai を使うなら接続先も）
docker compose up -d --build
curl "http://localhost:8091/WahaServer/servicerun/api/startsession?authkey=<WAHA_AUTHKEY>"   # → セッション ID
```

ストリームファイルのディレクトリ（`WAHA_EMULATOR_STREAM_DIR`、既定 `../server-local/data/stream-output`）は、**起動前に自分のユーザーで作っておく**。ないまま起動すると Docker が root 所有で作り、Linux では uid 1000 の server-local が書き込めなくなるため、compose はディレクトリを作らずに起動エラー（`bind source path does not exist`）にしている。

停止・削除は `docker compose down`。

## server-local と組み合わせる

server-local の `WAHA_URL` をエミュレーターに向け、`WAHA_AUTHKEY` を同じ値にする。ストリームファイルは server-local が作ってパスを渡し、エミュレーターが追記するため、**同じディレクトリが両方から同じパスで見える**必要がある。

### 両方とも Docker で動かす

server-local のコンテナはストリームファイルを `/app/data/stream-output` に作る（ホストの `server-local/data/stream-output`）。エミュレーターの compose は既定で同じホストのディレクトリを同じパスにマウントするため、パスの読み替え（server-local の `STREAM_WAHA_OUTPUT_DIR`）は要らない。

```bash
# 0. 共有するディレクトリを先に作る（root 所有で作られないように）
mkdir -p server-local/data/stream-output

# 1. エミュレーター（waha-emulator/.env の WAHA_AUTHKEY=任意の値）
cd waha-emulator && docker compose up -d --build

# 2. server-local（server-local/.env）
#    WAHA_URL=http://host.docker.internal:8091/
#    WAHA_AUTHKEY=エミュレーターと同じ値
cd ../server-local && docker compose up -d --build

# 3. 確かめる（SECURITY_SERVER_AUTH_KEY は server-local/.env の値）
curl -N -H "X-SERVER-AUTH-KEY: <SECURITY_SERVER_AUTH_KEY>" \
  -F 'textData={"assistantId":"gpt-4o","messageId":"m-1","userInput":"こんにちは"};type=application/json' \
  http://localhost:8090/api/messages/content
# → data:{"type":"text_delta","text":"こんにちは"} … message_stop … message_content
```

- server-local の `SERVER_LOCAL_DATA_DIR` を変えた場合は、エミュレーターの `WAHA_EMULATOR_STREAM_DIR` を `<そのディレクトリ>/stream-output` にする
- 両方のコンテナは既定で uid 1000 で動く。server-local の `SERVER_LOCAL_UID`/`GID` を変えたら、エミュレーターの `WAHA_EMULATOR_UID`/`GID` も揃える（server-local が作ったファイルにエミュレーターが追記するため）

### 両方ともホストで動かす

同じファイルシステムなので、server-local が渡すパスをそのまま使える。`STREAM_ALLOWED_DIR` は server-local のストリームファイルの出力先（既定 `server-local/data/stream-output`）にする。

```bash
# エミュレーター
mkdir -p server-local/data/stream-output
cd waha-emulator
uv sync
WAHA_AUTHKEY=local-key STREAM_ALLOWED_DIR=../server-local/data/stream-output \
  uv run uvicorn waha_emulator.main:app_factory --factory --port 8091 --no-access-log

# server-local（別のターミナル。server-local/.env で WAHA_URL=http://localhost:8091/、WAHA_AUTHKEY=local-key）
cd server-local
uv run uvicorn app.main:app_factory --factory --port 8090
```

## 開発

```bash
cd waha-emulator
uv sync
uv run pytest          # LLM は偽物か echo。server-local との結合テストも含む
uv run ruff check . && uv run ruff format --check .
uv run mypy
```

- `tests/test_server_local_roundtrip.py` は、リポジトリの `server-local/` を読み込み、server-local の `WahaClient` とアプリ（SSE・同期 API）から ASGI でエミュレーターを呼ぶ。server-local の Waha! の呼び方が変わったら、ここで食い違いが分かる
- uvicorn のアクセスログは出さない（`startsession` のクエリの authkey がログに残るため）
