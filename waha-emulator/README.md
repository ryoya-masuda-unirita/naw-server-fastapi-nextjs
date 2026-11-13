# waha-emulator

Waha!（ユニリタの ETL 製品）の servicerun API を真似る、Python（FastAPI）のサービス（Issue #274）。`server-local/` から SECURE アシスタントのチャットを通しで動かすために、Waha! の代わりに置く。

移植元のリポジトリには Waha! 本体がないため、API は `server-local/app/clients/waha_client.py`（移植元 `ServiceRunService` の移植）が使うものだけを、同じパス・パラメータ・応答で作っている。ワークフローは、移植した**生成AIアダプタ**（ルートの `generative-ai-adapter/`。通常チャットと RAG 回答。#298）を呼ぶ。検索・埋め込みのアダプタは、後続の Issue で移植してワークフローに差し込む。

- 動作環境: Linux（Docker コンテナ）。ホストで直接動かしてもよい
- セッションはメモリに持つ（再起動で消える）
- `backend/`・`server-local/` とは独立したプロジェクトで、コードは共有しない（テストだけ `server-local/` を読み込む）。生成AIアダプタだけは `../generative-ai-adapter/generative-ai-adapter` をパス依存で使う（core も一緒に入る）
- 設計は [docs/issue-274](../docs/issue-274/)（土台）・[docs/issue-298](../docs/issue-298/)（アダプタの差し込み）

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

1. サービス ID に登録されたワークフロー（`WAHA_WORKFLOWS_FILE` の `services`）
2. `splitLength`・`filepath` 付き → 学習（未対応の失敗）
3. `start`・`end` 付き → 学習データの同期（未対応の失敗）
4. それ以外 → 既定のワークフロー（`WAHA_WORKFLOWS_FILE` の `default`。ファイルがなければ `LLM_PROVIDER` から作る）

ワークフローは**生成AIアダプタを 1 回動かす**。本物の Waha! のジョブと同じ順序（`set_property` → `connect` → `set_column_information` → `set_view_name` → `before_execute` → `write`）で呼び、アダプタが `OUTPUT_DIR/<ビュー名>` に書いた JSON（`{"answer": "...", "filepaths": [], "references": [], "imageExplanations": []}`）を `outputfile` にする。入力スロットは次のようにアダプタへ渡す。

| 入力 | アダプタへの渡し方 |
|---|---|
| `question` | 列 index 0（ユーザー・文字）。必須（ない呼び出し、学習データの削除など、は未対応の失敗） |
| `attachmentfile` | 列 index 0（ユーザー・FILE）。通常チャット（出力モード 0・2）だけ |
| `history` | 列 index 4（会話履歴 Json・FILE） |
| `textdata` | プロパティ 43（SecuAiGent textData JSON file path）。`createLibrary`・`tools`・`accessToken` などはアダプタが解釈する |
| execute の `streamfilepath` | プロパティ 42（推論出力先ファイルパス） |
| 定義の `ragContextJson` | 列 index 6（RAG Context JSON パス）。RAG（出力モード 1）だけ |

アダプタは同期処理のため別スレッドで動かす。アダプタの失敗（プロパティ不正・プロバイダの失敗など）は `FAILURE: 生成AIアダプタの実行に失敗しました: 理由` になる（理由はアダプタが秘密情報を伏せた文言）。

### ワークフローの設定（サービス ID → アダプタの設定）

本物の Waha! の「どのサービス ID でどのアダプタをどの設定で動かすか」の定義は、どちらのリポジトリにもない。エミュレーターでは JSON ファイル（`WAHA_WORKFLOWS_FILE`）で持つ。`services` に書いたサービス ID（server-local が渡すアシスタント ID）はその定義、書いていないものは `default` の定義で動く。ファイルがなければ、`LLM_PROVIDER`（`echo` / `azure_openai`）から作った出力モード 0 の定義だけで動く。

```json
{
  "default": {
    "outputType": 0,
    "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo"}
  },
  "services": {
    "azure-chat": {
      "outputType": 0,
      "properties": {
        "VENDOR": "AzureOpenAI",
        "URL": "${AZURE_OPENAI_ENDPOINT}",
        "API_KEY": "${AZURE_OPENAI_API_KEY}",
        "MODEL_NAME": "${AZURE_OPENAI_DEPLOYMENT}"
      }
    },
    "echo-rag": {
      "outputType": 1,
      "ragContextJson": "rag-context.example.json",
      "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo", "RAG_CONTEXT_JSON_ALLOW_ROOT": "/app/config"}
    }
  }
}
```

- `outputType`: アダプタの出力モード。`0` チャット用_回答（`RetrievalAnswer` の JSON）、`1` チャット用_コンテクスト（RAG 回答。JSON）、`2` 回答（本文だけ）。省略は `0`。`1` では `question` に加えて `ragContextJson` の RAG Context JSON を引用資料にして回答する。**検索アダプタ（別 Issue）ができるまで、RAG の入力はこのファイル固定**（`RAG_CONTEXT_JSON_ALLOW_ROOT` の下のファイル。契約は移植元の `docs/rag-context-json-contract.md`）
- `properties`: 移植元の `PropertyIds` の名前（`URL`・`API_KEY`・`MODEL_NAME`・`VENDOR`・`TENANT_ID`・`TEMPERATURE`・`TIMEOUT_SECONDS`・`REASONING_EFFORT` など）→ 値。`VENDOR` は `AzureOpenAI` のような名前でも `1` のような ID でもよい。値は `${環境変数}` で参照できる（API キーをファイルに書かないため。未設定の環境変数は起動時のエラー）
- `OUTPUT_DIR`・`REASONING_OUTPUT_PATH`・`TEXT_DATA_JSON_FILE_PATH` はエミュレーターがジョブごとに決めるため書けない
- 不正な設定（未知の名前・不正な値・未知のベンダー）は起動時にエラーにする（アダプタの保存時チェック `validate_property` を通す）
- 例は [config/workflows.example.json](./config/workflows.example.json)（Docker では `config/` が `/app/config` に読み取り専用でマウントされる）

### ストリームファイル（途中経過）

`execute` に `streamfilepath` があれば、その値をアダプタのプロパティ 42 に渡す。アダプタ（`ReasoningOutputSink`、移植元と同じ）が、推論の差分・ライブラリ生成の差分を届いた順に次の 1 行ずつ追記する。ジョブが終わったらエミュレーターが `completed`（失敗なら `error`）を書く。

```
data:{"type":"reasoning_delta","text":"差分"}
data:{"type":"library_title_delta","text":"差分"}
data:{"type":"completed"}
```

- ファイルは server-local が execute の前に作る。こちらは作らず、なければジョブを失敗にする（移植元アダプタと同じ）。`STREAM_ALLOWED_DIR` があれば、execute の `streamfilepath` と、SecuAiGent の textData の `streamfilepath`（プロパティ 42 より優先される）の両方をそのディレクトリの中に制限する
- **回答本文（`text_delta`）はストリームファイルに書かない**。移植元アダプタは本文を書かず（回答は出力ファイルだけ）、server-local も NAW 互換 SSE では本文を `outputfile` から確定時にまとめて送る。`reasoning_delta` は server-local の SSE（NAW 互換・旧形式）でそのまま届く。echo は動作確認用に、回答を 8 文字ずつ `reasoning_delta` として流す。OpenAI・Azure は非ストリーミングで呼ぶため（移植元と同じ）途中経過は出ない
- SecuAiGent では推論・ライブラリ生成の差分がクラウドから届く（`createLibrary` を true にした textData を渡すと `library_title_delta`・`library_content_delta` も書かれる）

## LLM の接続先

`WAHA_WORKFLOWS_FILE` がないとき、`LLM_PROVIDER` で既定のワークフロー（出力モード 0）のアダプタ設定を作る。ファイルがあるときは、この値は使わない（ファイルの定義が優先）。

| `LLM_PROVIDER` | 動作 |
|---|---|
| `echo`（既定） | キー不要。アダプタの `Echo` プロバイダ。質問をそのまま回答として返す |
| `azure_openai` | アダプタの AzureOpenAI プロバイダ（chat completions を非ストリーミングで呼ぶ）。`AZURE_OPENAI_ENDPOINT`・`AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_DEPLOYMENT` が必須（足りなければ起動時にエラー）。API バージョンは移植元の SDK の最新（`2025-01-01-preview`）で固定 |

## 環境変数

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `WAHA_AUTHKEY` | なし（必須） | `startsession` の `authkey` と照合する。server-local の `WAHA_AUTHKEY` と同じ値にする |
| `EXECUTE_WAIT_FOR_COMPLETION` | `true` | `true`: execute はジョブの完了まで応答しない。`false`: すぐ応答する。server-local の同期 API・学習は execute の後に「間隔 × 回数」（既定 2 秒 × 10 回）しか結果を待たないため、`false` で LLM が遅いと失敗する |
| `STREAM_ALLOWED_DIR` | 未設定（Docker では `/app/data/stream-output`） | 設定すると `streamfilepath` をこのディレクトリの中だけに制限する。未設定だと、セッションを開ければ（authkey を知っていれば）任意の既存ファイルに追記できるため、ホストで動かすときも設定する |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `3600` | この時間使われていないセッション（実行中のジョブがないもの）を、次の `startsession` で破棄する。server-local は失敗時に `endsession` を呼ばない経路がある（学習データの同期など）ため |
| `WAHA_WORKFLOWS_FILE` | 未設定 | サービス ID → ワークフローの JSON（上の「ワークフローの設定」）。空文字列は未設定。Docker では `/app/config/workflows.example.json` など |
| `LLM_PROVIDER` | `echo` | `WAHA_WORKFLOWS_FILE` がないときの既定。`echo` / `azure_openai` |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | 空 | `azure_openai` のとき必須。デプロイ名は chat completions の URL のモデル名になる |
| `LOG_LEVEL` | `INFO` | |

Docker Compose では、ほかに `WAHA_EMULATOR_PORT`（既定 8091）・`WAHA_EMULATOR_STREAM_DIR`（既定 `../server-local/data/stream-output`）・`WAHA_EMULATOR_CONFIG_DIR`（既定 `./config`。`/app/config` に読み取り専用でマウントする）・`WAHA_EMULATOR_UID`/`WAHA_EMULATOR_GID`（既定 1000）・`TZ`（既定 `Asia/Tokyo`）を使う。ビルドのコンテキストはリポジトリのルート（生成AIアダプタをイメージに含めるため）。

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
# → data:{"type":"reasoning_delta","text":"こんにちは"} … text_delta … message_stop … message_content
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
uv run pytest          # LLM は偽物か echo（HTTP はモック）。server-local との結合テストも含む
uv run ruff check . && uv run ruff format --check .
uv run mypy
```

- `tests/test_server_local_roundtrip.py` は、リポジトリの `server-local/` を読み込み、server-local の `WahaClient` とアプリ（SSE・同期 API）から ASGI でエミュレーターを呼ぶ。server-local の Waha! の呼び方が変わったら、ここで食い違いが分かる
- チャット 1 回でどの部品がどの順に動いたかのログの読み方と、Docker での通しの確認手順は [generative-ai-adapter/README.md](../generative-ai-adapter/README.md)
- uvicorn のアクセスログは出さない（`startsession` のクエリの authkey がログに残るため）
