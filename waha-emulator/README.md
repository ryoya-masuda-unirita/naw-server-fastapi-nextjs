# waha-emulator

Waha!（ユニリタの ETL 製品）の `servicerun` API を真似る、Python（FastAPI）のサービス。Waha! 本体はこのリポジトリにも移植元にもないため、`secuaigent-server-local/` から SECURE アシスタントのチャットを通しで動かすときに、Waha! の代わりに置く。検証用の道具で、製品の一部ではない。

- 動かすと、server-local が呼ぶ API（セッション・アップロード・実行・結果・ダウンロード）に答える。中身のワークフローは、移植した生成AIアダプタ・検索アダプタ・埋め込みアダプタを呼ぶ
- LLM は、既定では `echo`（質問をそのまま返す。キー不要）。実際の LLM には接続しない
- 動作環境は Linux（Docker コンテナ）。ホストで直接動かしてもよい。セッションはメモリに持つ（再起動で消える）

読む人ごとの入り口:

| 読む人 | 読む場所 |
|---|---|
| 初めて動かす | 「まず動かす」→「やりたいこと別の手順」 |
| 設定を変える・ワークフローを組む | 「リファレンス」 |
| 保守する・設計を知りたい | 「開発」と末尾の「設計メモ」 |

## まず動かす

ホストで単体起動し、`curl` で質問を 1 回通す（`echo` なので、質問がそのまま返る）。

```bash
cd waha-emulator
uv sync
WAHA_AUTHKEY=local-key uv run python -m uvicorn waha_emulator.main:app_factory --factory --port 8091 --no-access-log
```

別のターミナルで次を実行する。

```bash
BASE=http://127.0.0.1:8091/WahaServer/servicerun/api
SID=$(curl -s "$BASE/startsession?authkey=local-key")        # セッション ID
echo 'こんにちは' > /tmp/question.txt
curl -s -F file=@/tmp/question.txt "$BASE/upload/question?sessionid=$SID"   # → OK
curl -s "$BASE/execute/any-service?sessionid=$SID"                          # → SUCCESS
curl -s "$BASE/download/outputfile?sessionid=$SID"                          # → {"answer":"こんにちは\n", ...}
curl -s "$BASE/endsession?sessionid=$SID"                                   # → OK
```

- `execute` のサービス ID（`any-service`）は、ワークフローに登録がなければ既定のワークフロー（`echo`）で動く
- uvicorn のアクセスログは出さない（`startsession` のクエリの authkey がログに残るため）。止めるときは Ctrl+C

## やりたいこと別の手順

### Docker で server-local と通しで動かす

`onprem/` の compose で、server-local・エミュレーター・ベクトルDB をまとめて起動する。起動・停止、基本の質問の `curl`、認証キーの既定値は [onprem/README.md](../onprem/README.md) を参照。

- 接続先（`WAHA_URL`）・認証キー・ストリームファイルの共有（named volume `stream-output`）は設定済み
- 認証キーを変えるときは、`onprem/.env` の `SERVER_LOCAL_AUTH_KEY`・`WAHA_AUTHKEY` を変える
- エミュレーターだけを起動するなら、次のようにする。単体用の compose はない（#483 で廃止）

  ```bash
  cd onprem
  docker compose up -d --build waha-emulator
  curl "http://localhost:18091/WahaServer/servicerun/api/startsession?authkey=onprem-waha-key"   # → セッション ID
  ```

- 既定値は `onprem/docker-compose.yml` にある。変えるときは `onprem/.env.example` を `onprem/.env` にコピーして書き換える
- ストリームファイルは named volume に置かれ、server-local と共有する。ログは `docker compose logs waha-emulator`、停止・削除は `docker compose down`
- ビルドのコンテキストはリポジトリのルート（生成AIアダプタをイメージに含めるため）
- 「server-local をホストで、エミュレーターだけ Docker で」という構成は、ストリームファイルを共有できないため使えない

### ホストで server-local と通しで動かす

server-local の `WAHA_URL` をエミュレーターに向け、`WAHA_AUTHKEY` を同じ値にする。ストリームファイルは server-local が作ってパスを渡し、エミュレーターが追記する。そのため、**同じディレクトリが両方から同じパスで見える**必要がある（ホストなら同じファイルシステムなので、そのまま使える）。`STREAM_ALLOWED_DIR` は server-local のストリームファイルの出力先（既定 `secuaigent-server-local/data/stream-output`）にする。

```bash
# エミュレーター
mkdir -p secuaigent-server-local/data/stream-output
cd waha-emulator
uv sync
WAHA_AUTHKEY=local-key STREAM_ALLOWED_DIR=../secuaigent-server-local/data/stream-output \
  uv run python -m uvicorn waha_emulator.main:app_factory --factory --port 8091 --no-access-log

# server-local（別のターミナル。secuaigent-server-local/.env で WAHA_URL=http://localhost:8091/、WAHA_AUTHKEY=local-key）
cd secuaigent-server-local
uv run alembic upgrade head   # 初回だけ。ホストで動かすときは SQLite のテーブルを先に作る
uv run python -m uvicorn app.main:app_factory --factory --port 8090
```

### 画面でワークフローを組む

ノードと線でワークフローを組む画面（`ui/`）を使う。`onprem/` の compose に入っているので、`docker compose up` だけで、エミュレーターと一緒に http://127.0.0.1:18092 に立ち上がる（手順は [onprem/README.md](../onprem/README.md)）。compose を使わずホストで動かすときは次のとおり。

```bash
# エミュレーター（WAHA_STUDIO_DIR を設定すると管理用 API が有効になる）
cd waha-emulator
WAHA_AUTHKEY=local-key WAHA_STUDIO_DIR=./data/workflows uv run python -m uvicorn waha_emulator.main:app_factory --factory --port 8091

# 画面（別のターミナル）
cd waha-emulator/ui
npm install
npm run dev        # http://127.0.0.1:5174
```

使い方、API だけで保存する方法は、リファレンスの「ワークフローエディター（画面）」「ノードと線で組んだワークフロー（管理用 API）」を参照。

### サービス ID ごとにアダプタの設定を変える

RAG・回答本文だけの出力・Azure OpenAI などを使い分けるときは、JSON ファイルを作り、環境変数 `WAHA_WORKFLOWS_FILE` にそのパスを指す。書き方はリファレンスの「ワークフローの設定」、例は [config/workflows.example.json](./config/workflows.example.json)。

### 実際の LLM に切り替える

設定ファイルがないときは、`LLM_PROVIDER=azure_openai` と `AZURE_OPENAI_ENDPOINT`・`AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_DEPLOYMENT` で切り替える。詳細は「LLM の接続先」。Bedrock は、[onprem/README.md](../onprem/README.md) の「Bedrock で動かす」を参照。

## リファレンス

### API

ベースパスは `WahaServer/servicerun/api`。応答はすべてテキスト。存在しないセッションは 404。

| API | パラメータ | 応答 |
|---|---|---|
| `GET /startsession` | `authkey` | セッション ID。authkey が違えば 401 |
| `GET /endsession` | `sessionid` | `OK`。スロットのファイルを破棄し、実行中のジョブを止める |
| `POST /upload/{slot}` | `sessionid`、multipart の `file` | `OK`。入力スロット（`file`・`question`・`attachmentfile`・`history`・`textdata`）だけ受け付ける |
| `GET /execute/{serviceId}` | `sessionid`、ほかはワークフローに渡す | 既定はジョブの完了まで待って `/result` と同じ文字列。`EXECUTE_WAIT_FOR_COMPLETION=false` ならすぐ `OK` |
| `GET /result` | `sessionid` | `RUNNING` / `SUCCESS` / `FAILURE: 理由`。execute の前は `RUNNING` |
| `GET /download/{slot}` | `sessionid` | スロットの中身（出力は `outputfile`） |

- サービス ID が空の `/execute/` も使える
- execute に渡せるパラメータは `streamfilepath`・`splitLength`・`filepath`・`start`・`end`

### ワークフローの選び方

`execute` のサービス ID とパラメータで、次の順に選ぶ。

1. サービス ID に登録されたワークフロー（`WAHA_WORKFLOWS_FILE` の `services`）
2. `splitLength`・`filepath` 付き → 学習（サービス ID の登録がなければ未対応の失敗）
3. `start`・`end` 付き → 学習データの同期（同上）
4. それ以外 → 既定のワークフロー（`WAHA_WORKFLOWS_FILE` の `default`。ファイルがなければ `LLM_PROVIDER` から作る）

ワークフローは**生成AIアダプタを 1 回動かす**。本物の Waha! のジョブと同じ順序（`set_property` → `connect` → `set_column_information` → `set_view_name` → `before_execute` → `write`）で呼ぶ。アダプタが `OUTPUT_DIR/<ビュー名>` に書いた JSON（`{"answer": "...", "filepaths": [], "references": [], "imageExplanations": []}`）が `outputfile` になる。入力スロットは、次のようにアダプタへ渡す。

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

本物の Waha! の「どのサービス ID でどのアダプタをどの設定で動かすか」の定義は、どちらのリポジトリにもない。エミュレーターでは JSON ファイル（`WAHA_WORKFLOWS_FILE`）で持つ。

- `services` に書いたサービス ID（server-local が渡すアシスタント ID）は、その定義で動く
- 書いていないサービス ID は、`default` の定義で動く
- ファイルがなければ、`LLM_PROVIDER`（`echo` / `azure_openai`）から作った出力モード 0 の定義だけで動く

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

- `outputType`: アダプタの出力モード。省略は `0`
  - `0`: チャット用_回答（`RetrievalAnswer` の JSON）
  - `1`: チャット用_コンテクスト（RAG 回答。JSON）。`question` に加えて、`ragContextJson` の RAG Context JSON を引用資料にして回答する
  - `2`: 回答（本文だけ）
- `ragContextJson`: 検索アダプタを使わず、固定の入力で確かめるとき用。`RAG_CONTEXT_JSON_ALLOW_ROOT` の下のファイルを書く（契約は移植元の `docs/rag-context-json-contract.md`）。`retrieval` を書くと、その前に検索アダプタが動く（下記）
- `properties`: 移植元の `PropertyIds` の名前（`URL`・`API_KEY`・`MODEL_NAME`・`VENDOR`・`TENANT_ID`・`TEMPERATURE`・`TIMEOUT_SECONDS`・`REASONING_EFFORT` など）→ 値
  - `VENDOR` は `AzureOpenAI` のような名前でも `1` のような ID でもよい
  - 値は `${環境変数}` で参照できる（API キーをファイルに書かないため。未設定の環境変数は起動時のエラー）
- `retrieval`（出力モード 1 のときだけ）: RAG の前に検索アダプタを動かす。`ragContextJson`・`RAG_CONTEXT_JSON_ALLOW_ROOT` とは同時に書けない
  - `properties` は検索アダプタの `RetrievalPropertyIds` の名前
  - クエリの埋め込み: `VENDOR`・`URL`・`API_KEY`・`MODEL_NAME`
  - ベクトルDB: `VDB_VENDOR`・`VDB_URL`・`VDB_USER_NAME`・`VDB_PASSWORD`・`VDB_DATABASE_NAME`・`VDB_TABLE_NAME`
  - そのほか: `SEARCH_COUNT`、`GRAPH_RAG_ENABLED`、`AGE_GRAPH_NAME`、`HYBRID_RETRIEVAL_ENABLED`、`PROVIDER_LLM_RERANK_*` など
  - `VENDOR`（`Echo`・`OpenAI`・`AzureOpenAI`・`SecuAiGent` または ID）と `VDB_VENDOR`（`PostgreSQL(PGVector)`・`Azure AI Search` または ID）は名前でも書ける
- 書けないプロパティ: `OUTPUT_DIR`・`REASONING_OUTPUT_PATH`・`TEXT_DATA_JSON_FILE_PATH` は、エミュレーターがジョブごとに決める。`retrieval.properties` では `OUTPUT_DIR`・`TEXT_DATA_JSON_FILE_PATH` が書けない（textData は生成AIアダプタと同じファイルを検索アダプタにも渡す）
- 不正な設定（未知の名前・不正な値・未知のベンダー）は、起動時にエラーにする（アダプタの保存時チェック `validate_property` を通す）
- **ひな形（フォルダごとに保存先を分ける。Python 版だけ）**: `services` のキーの末尾を `*` にすると、その前の部分（`kb-learn-` など）で始まるサービス ID が呼ばれたとき、後ろの部分（接尾辞）を値の `{name}` に入れた定義で動く
  - `VDB_TABLE_NAME` を `docs_{name}` にすると、サービス ID の末尾ごとに保存先が分かれる（テーブルは最初の学習で自動で作られる）
  - `{name}` がないひな形は、読み込みで失敗する。個別に書いたサービス ID は、ひな形より優先する
  - 接尾辞は英小文字・数字・`_` の 1〜40 文字。違うと 400（ハイフン `-`・大文字・ドットは使えない。保存先のテーブル名になるため。例: `kb-learn-hr-dept` は 400 になるので `kb-learn-hr_dept` にする）
  - 手順は [onprem/README.md](../onprem/README.md) の「学習先フォルダごとに検索の対象を分ける」
- `VENDOR` に `Bedrock`（Python 版だけ。AWS Bedrock の Claude）も書ける。例は [onprem/config/workflows.bedrock.example.json](../onprem/config/workflows.bedrock.example.json)、手順は [onprem/README.md](../onprem/README.md) の「Bedrock で動かす」（`bedrock-ext`）
- 例は [config/workflows.example.json](./config/workflows.example.json)（`onprem/` の compose では `config/` が `/app/config` に読み取り専用でマウントされる）

### ノードと線で組んだワークフロー（管理用 API）

`WAHA_STUDIO_DIR` を設定すると、ノードと線で組んだワークフローを、管理用 API（`/admin/workflows`）で作成・更新・削除できる（Issue #520）。保存したワークフローは、再起動なしで、そのサービス ID の execute で動く。

- サービス ID が設定ファイル（`WAHA_WORKFLOWS_FILE`）の定義と同じなら、**保存したワークフローが優先**される。削除すると、設定ファイルの定義に戻る
- `WAHA_STUDIO_DIR` が未設定なら管理用 API は載らず、設定ファイルだけで動く
- 認証はない（検証用の道具）。保存先は 1 ワークフロー = 1 つの JSON ファイル（`<id>.json`）

| API | 内容 |
|---|---|
| `GET /admin/workflows` | 一覧（`id`・`name`・`serviceIds`） |
| `POST /admin/workflows` | 作成（201）。不正は 400、id・サービス ID の重複は 409 |
| `POST /admin/workflows/validate` | 保存せずに検証する |
| `GET /admin/workflows/{id}` | 取得（API キーなどは `********` に伏せる） |
| `PUT /admin/workflows/{id}` | 更新。`********` のままの値は、保存済みの値を引き継ぐ |
| `DELETE /admin/workflows/{id}` | 削除（204） |
| `GET /admin/property-catalog` | ノードに書けるプロパティ名の候補（生成AI・検索。秘密の名前に印）。画面の選択肢に使う |

版 1（`version: 1`）の例。

```json
{
  "version": 1,
  "id": "assistant-1",
  "name": "社内QA",
  "serviceIds": ["assistant-1"],
  "nodes": [
    {"id": "start", "type": "start", "position": {"x": 0, "y": 0}},
    {"id": "gen", "type": "generative-ai", "name": "生成AI", "position": {"x": 300, "y": 0},
     "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo"}},
    {"id": "end", "type": "end", "position": {"x": 600, "y": 0}}
  ],
  "edges": [{"source": "start", "target": "gen"}, {"source": "gen", "target": "end"}]
}
```

- ノードの種類: `start`・`retrieval`（検索アダプタ）・`generative-ai`（生成AIアダプタ）・`end`。`properties` の書き方は、設定ファイルの `properties`・`retrieval.properties` と同じ（`${環境変数}` も使える）
- つなぎ方は、`start →（retrieval →）generative-ai → end` の 1 本の鎖だけ。検索ノードがあると RAG（出力モード 1）、なければ通常チャット（0。生成AI ノードの `outputType` に 2 を書くと、回答の本文だけ）
- 学習・削除・同期は、まだ設定ファイルの定義で動く
- 失敗理由には、失敗したノードの名前が付く（例: `FAILURE: ノード「検索」: 検索アダプタの実行に失敗しました: …`）

#### 版 2（自由なつなぎ方。Issue #530）

`version` を `2` にすると、ノードを自由につなぎ、前のノードの出力を、あとのプロンプトで使えるワークフローを組める。版 1 は、これまでどおり動く（同じ保存先に共存する）。

- 画面（`ui/`）は版 2 に対応している。「＋ 生成AI」「＋ 検索」「＋ 条件分岐」などでノードを足し、線を引いて組む
- 画面の下の「試し実行」から、保存したワークフローに質問を送れる（`POST /admin/workflows/{id}/run`、本文 `{"question": "..."}`。質問は 4000 文字・実行は 120 秒まで）
- 版 1 のワークフローは、画面で開くと版 2 に変換される（保存するまで、保存先は変わらない）

| ノード | `config` | 役割 |
|---|---|---|
| `start` | なし | 質問（`{{question}}`）・会話履歴（`{{history}}`）を持つ |
| `llm` | `prompt`（必須）・`properties`（接続）・`outputType`（0 か 2。既定 0）・`inheritContext`（既定 false） | プロンプトを埋めて、生成AI を 1 回呼ぶ。出力は `{{ノードID.text}}` |
| `template` | `text`（必須） | 変数を埋めた文字列を作る。出力は `{{ノードID.text}}` |
| `retrieval` | `properties`（検索アダプターの接続。`VDB_*` など）・`query`（検索語のテンプレート。既定 `{{question}}`） | 検索し、引用資料の本文を `{{ノードID.contexts_text}}`（空行で区切ってつないだ文字列）にする |
| `branch` | `variable`（調べる変数。`judge.text` など）・`operator`（`contains`・`equals`・`empty`）・`value`（`empty` では書かない） | 条件に合えば「はい」（`true`）、合わなければ「いいえ」（`false`）の線をたどる |
| `end` | `output`（必須） | 回答にする文字列（`{{...}}` を埋め込める）。**複数置ける**（たどり着いた終了が、回答になる） |

- 変数は `{{question}}`・`{{history}}`・`{{ノードID.text}}`（生成AI・テンプレート）・`{{ノードID.contexts_text}}`（検索）。**そのノードより前に動くノードの出力だけ**使える（保存の時点で、使えない参照は、どのノードのどの項目かを示して 400 になる）
- `outputType` が 2 のノードは、回答の本文をそのまま、0 のノードは、回答の JSON の `answer` を、`{{ノードID.text}}` にする。途中のノードは 2 がおすすめ
- `inheritContext` が true のノードにだけ、会話履歴と添付ファイルを渡す（textData は、いつも渡す）
- `branch` の `value` は、そのままの文字列で、`{{...}}` は展開しない。大文字小文字は区別しない。`contains`・`equals` は、`value` の前後の空白を無視する
- `end` の出力が `{{生成AIノード.text}}` 1 つだけなら、そのノードの出力を、そのまま返す（出力モード 0 なら、引用元つきの回答の JSON、2 なら本文だけ）。文字が混ざるときは、埋めた文字列を `answer` にした JSON にする。**server-local が読むのは回答の JSON なので、最後の生成AI は、出力モード 0 にする**
- 生成AI ノードに `retrieval`（検索ノードの ID）を書くと、その検索の結果を引用資料に、RAG（出力モード 1。`outputType` は書けない）で回答する。回答の `references` に、引用元が入る
- 線は、条件分岐から出る 2 本に `sourceHandle`（`true`・`false`）を付ける。条件分岐は 2 本とも必要で、ほかのノードの線には付けない
- **合流（複数の線が入る）・並列・ループは、まだ作れない**。ノードは 50 個まで

例（下書き → 推敲）。

```json
{
  "version": 2, "id": "polish", "name": "推敲", "serviceIds": ["polish"],
  "nodes": [
    {"id": "start", "type": "start", "position": {"x": 0, "y": 0}},
    {"id": "draft", "type": "llm", "name": "下書き", "position": {"x": 280, "y": 0},
     "config": {"prompt": "{{question}} に回答してください", "outputType": 2,
                "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo"}}},
    {"id": "polish", "type": "llm", "name": "推敲", "position": {"x": 560, "y": 0},
     "config": {"prompt": "次の下書きの誤りを直してください:\n{{draft.text}}",
                "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo"}}},
    {"id": "end", "type": "end", "position": {"x": 840, "y": 0}, "config": {"output": "{{polish.text}}"}}
  ],
  "edges": [{"source": "start", "target": "draft"}, {"source": "draft", "target": "polish"}, {"source": "polish", "target": "end"}]
}
```

保存して、サービス ID `polish` で呼ぶ。

```bash
curl -X POST http://127.0.0.1:8091/admin/workflows -H 'content-type: application/json' --data @polish.json
```

`Echo` は質問（プロンプト）をそのまま返すため、2 回目の回答に、1 回目の回答が入って見える。

**根拠チェック付きの RAG**（検索 → 回答 → 判定 → 条件分岐）は、次のように組む。定義の全体は `tests/studio_support.py` の `rag_check_flow_data`。

- `start → ret`（検索）`→ answer`（生成AI。`retrieval: ret`）`→ judge`（生成AI。`outputType: 2`。プロンプトに `{{ret.contexts_text}}` と `{{answer.text}}`）`→ check`（条件分岐。`judge.text` が `OK` を含むか）
- はい: `end-ok`（`{{answer.text}}`）／いいえ: `end-ng`（固定の文）

### ワークフローエディター（画面）

`ui/`（React + React Flow）は、管理用 API を使って、ノードと線でワークフローを組む画面（Issue #522）。左に一覧、中央にキャンバス、右にプロパティを置く。デプロイは対象外で、開発サーバーで動かす。起動手順は「やりたいこと別の手順」の「画面でワークフローを組む」。

- `/admin` は、開発サーバーがエミュレーター（既定は `http://127.0.0.1:8091`。環境変数 `WAHA_URL` で変える）へ中継する。エミュレーターに CORS の設定は要らない
- 操作: 一覧から開く・`＋ 新規` で作成 → 検索ノードの追加（`＋ 検索ノード`。1 つまで）→ ノードの出力から入力へ線を引く（Delete で消す）→ 右のパネルで名前・プロパティを編集 → `検証`・`保存`（Ctrl/Cmd + S）
- 線は、開始 →（検索 →）生成AI → 終了の 1 本の鎖だけ引ける。反する線は、引いた時点で理由を出して拒否する（最終判断は保存時のサーバーの検証）
- プロパティ名は、アダプターの候補（`GET /admin/property-catalog`）から選ぶ。API キー・パスワードは入力中の文字を隠し、保存済みの値は `********` で伏せて「保存済みの値を使います」と表示する（「入れ直す」で変えられる）
- 未保存の変更があると、移動・閉じる前に確認を出す
- 画面の検査コマンド: `npm run lint`・`npm run type-check`・`npm test`・`npm run build`
- 学習・削除・同期のノードは、まだない

### 検索 → 生成AI（RAG チャット）

`retrieval` があるサービスでは、質問を検索文字列として検索アダプタ（出力モード 1）を動かし、ジョブのディレクトリに RAG Context JSON を書かせる。そのあと、生成AIアダプタ（出力モード 1）の列 index 6 にそのパスを渡す。ログ（INFO）は次の順に並ぶ。

```
[…workflows.generative_ai] workflow step 1/2 retrieval: serviceId=…, columns=[(0, 'CHAR')], properties=[…]   ← 検索アダプタの入力（値は出さない）
[retrieval_adapter.controller] retrieval: queryChars=…, maxResult=…, outputFormat=RAG_CONTEXT_JSON_V1, vectorDb=…
[generative_ai_core.retrieval.runtime] core retrieval: provider=PostgreSQL, queryType=…, strategies=[…]       ← クエリの分類と検索戦略
[generative_ai_core.retrieval.postgresql_provider] postgresql retrieval: route=vector | hybrid
[generative_ai_core.retrieval.query_embedding] query embedding: provider=…, dimensions=…
[…runtime] core retrieval finished: ids=N, graphExpanded=…
[retrieval_adapter.controller] retrieval output written: format=RAG_CONTEXT_JSON_V1, ids=N, chars=…
[…workflows.generative_ai] workflow step 2/2 generative-ai: serviceId=…                                       ← ここから生成AIアダプタ
```

### 埋め込みアダプタのワークフロー（学習・削除・同期）

`adapter` を `embedding` にした定義は、埋め込みアダプタで server-local の学習・削除・同期を動かす。`operation` でどれをするかを選び、**学習・削除・同期のサービス ID を別々に登録する**（server-local は、学習・削除・同期のサービス名をインデックスごとに別々に持つ）。本物の Waha! の定義はどちらのリポジトリにもないため、server-local が読む出力の形（`file_service.py`・`waha_client.py`）から決めた。

- `operation: learn`（学習）
  - server-local の呼び出し: `file` スロットに学習するファイル、`splitLength`、`filepath`（参照元）
  - アダプタの動き: 出力モード 3（新規登録。既定）または 1（追加登録）で、分割してベクトルDB に保存する
  - outputfile: `"ファイル ID"<TAB>"パート ID"` をチャンクごとに 1 行（TSV。行は CRLF 区切り）
- `operation: delete`（削除）
  - server-local の呼び出し: `file` スロットにパート ID を 1 行ずつ書いたテキスト
  - アダプタの動き: 行 ID からファイル ID を引き、出力モード 2（削除）で消す
  - outputfile: 空
- `operation: sync`（同期）
  - server-local の呼び出し: `start`・`end`
  - アダプタの動き: アダプタは使わず、ベクトルDB の行（`ORDER BY fileid, id OFFSET start LIMIT end-start`）を読む
  - outputfile: `"パス"<TAB>"パート ID"<TAB>"ファイル ID"`（TSV。行は CRLF 区切り）

補足。

- **学習の入力**: `file` スロットのファイルを使う。スロットが空なら `filepath` のパスを読む（`SOURCE_ALLOWED_DIR` の中のファイルだけ。未設定なら失敗にする）。`splitLength` が空なら定義の `defaultSplitLength`（既定 1000）。アップロードされたファイルは、ベクトルDB のパスを `<filepath>/<ファイル名>` に直す（同期で server-local がファイル名と参照元を取り出せるようにするため）
- **同期の取り込み元**: アダプタが保存した行に入っているパス（学習時にアップロードか `filepath` で渡されたもの）だけ。ファイルサーバーなどの外部は探索しない。server-local は 1 回で抜けるため `start=0, end=100` の 100 行まで
- **削除**: ベクトルDB の行は PostgreSQL（`VDB_VENDOR=PostgreSQL(PGVector)`）のときだけ。移植元の削除は GraphRAG のスキーマを参照するため、なければ作ってから消す。Graph 書き込みを有効にした場合の注意は [generative-ai-adapter/README.md](../generative-ai-adapter/README.md) の「移植元と挙動を変えた点」
- `properties` は埋め込みアダプタのプロパティ名: `URL`・`API_KEY`・`MODEL_NAME`・`VENDOR`（`Echo` はキー不要の確認用）・`TENANT_ID`・`VDB_VENDOR`・`VDB_URL`・`VDB_USER_NAME`・`VDB_PASSWORD`・`VDB_DATABASE_NAME`・`VDB_TABLE_NAME`・`GRAPH_WRITE_ENABLED` など。`OUTPUT_DIR` はジョブごとに決めるため書けない

```json
{
  "services": {
    "learn-svc": {
      "adapter": "embedding", "operation": "learn", "defaultSplitLength": 1000,
      "properties": {"VENDOR": "Echo", "URL": "http://echo.invalid", "API_KEY": "echo", "MODEL_NAME": "echo",
        "TENANT_ID": "tenant-a", "VDB_VENDOR": "PostgreSQL(PGVector)", "VDB_URL": "vector-db:5432",
        "VDB_USER_NAME": "onprem_vector", "VDB_PASSWORD": "onprem_vector_password", "VDB_DATABASE_NAME": "onprem_vector",
        "VDB_TABLE_NAME": "docs"}
    }
  }
}
```

`sync-svc`・`delete-svc` は `operation` だけ変えて同じ `properties` にする。完全な例は [config/workflows.example.json](./config/workflows.example.json)。

### ストリームファイル（途中経過）

`execute` に `streamfilepath` があれば、その値をアダプタのプロパティ 42 に渡す。アダプタ（`ReasoningOutputSink`、移植元と同じ）が、推論の差分・ライブラリ生成の差分を届いた順に次の 1 行ずつ追記する。ジョブが終わったらエミュレーターが `completed`（失敗なら `error`）を書く。

```
data:{"type":"reasoning_delta","text":"差分"}
data:{"type":"library_title_delta","text":"差分"}
data:{"type":"completed"}
```

- ファイルは server-local が execute の前に作る。こちらは作らず、なければジョブを失敗にする（移植元アダプタと同じ）
- `STREAM_ALLOWED_DIR` があれば、execute の `streamfilepath` と、SecuAiGent の textData の `streamfilepath`（プロパティ 42 より優先される）の両方を、そのディレクトリの中に制限する
- **回答本文（`text_delta`）はストリームファイルに書かない**。移植元アダプタは本文を書かず（回答は出力ファイルだけ）、server-local も NAW 互換 SSE では本文を `outputfile` から確定時にまとめて送る
- `reasoning_delta` は、server-local の SSE（NAW 互換・旧形式）でそのまま届く。echo は動作確認用に、回答を 8 文字ずつ `reasoning_delta` として流す
- OpenAI・Azure は非ストリーミングで呼ぶため（移植元と同じ）、途中経過は出ない
- SecuAiGent では、推論・ライブラリ生成の差分がクラウドから届く（`createLibrary` を true にした textData を渡すと `library_title_delta`・`library_content_delta` も書かれる）

### LLM の接続先

`WAHA_WORKFLOWS_FILE` がないとき、`LLM_PROVIDER` で既定のワークフロー（出力モード 0）のアダプタ設定を作る。ファイルがあるときは、この値は使わない（ファイルの定義が優先）。

| `LLM_PROVIDER` | 動作 |
|---|---|
| `echo`（既定） | キー不要。アダプタの `Echo` プロバイダ。質問をそのまま回答として返す |
| `azure_openai` | アダプタの AzureOpenAI プロバイダ（chat completions を非ストリーミングで呼ぶ）。`AZURE_OPENAI_ENDPOINT`・`AZURE_OPENAI_API_KEY`・`AZURE_OPENAI_DEPLOYMENT` が必須（足りなければ起動時にエラー）。API バージョンは移植元の SDK の最新（`2025-01-01-preview`）で固定 |

### 環境変数

Docker では、公開ポート・認証キー・ストリームファイルの共有などを `onprem/docker-compose.yml` と `onprem/.env`（[onprem/README.md](../onprem/README.md)）で決める。

| 環境変数 | 既定値 | 説明 |
|---|---|---|
| `WAHA_AUTHKEY` | なし（必須） | `startsession` の `authkey` と照合する。server-local の `WAHA_AUTHKEY` と同じ値にする |
| `EXECUTE_WAIT_FOR_COMPLETION` | `true` | `true`: execute はジョブの完了まで応答しない。`false`: すぐ応答する。server-local の同期 API・学習は execute の後に「間隔 × 回数」（既定 2 秒 × 10 回）しか結果を待たないため、`false` で LLM が遅いと失敗する |
| `SOURCE_ALLOWED_DIR` | 未設定（`onprem/` の compose では、`/mnt/file-server`（サンプル文書）に設定済み） | 埋め込みの学習で `file` スロットが空のとき、`filepath` で渡されたパスを読んでよいディレクトリ。未設定だと `filepath` による学習は失敗にする（任意のファイルを読ませないため） |
| `STREAM_ALLOWED_DIR` | 未設定（Docker では `/app/data/stream-output`） | 設定すると `streamfilepath` をこのディレクトリの中だけに制限する。未設定だと、セッションを開ければ（authkey を知っていれば）任意の既存ファイルに追記できるため、ホストで動かすときも設定する |
| `SESSION_IDLE_TIMEOUT_SECONDS` | `3600` | この時間使われていないセッション（実行中のジョブがないもの）を、次の `startsession` で破棄する。server-local は失敗時に `endsession` を呼ばない経路がある（学習データの同期など）ため |
| `WAHA_WORKFLOWS_FILE` | 未設定 | サービス ID → ワークフローの JSON（上の「ワークフローの設定」）。空文字列は未設定。Docker では `/app/config/workflows.example.json` など |
| `WAHA_STUDIO_DIR` | 未設定 | ノードと線で組んだワークフローの保存先。設定すると管理用 API（`/admin/workflows`）が有効になる。空文字列は未設定 |
| `LLM_PROVIDER` | `echo` | `WAHA_WORKFLOWS_FILE` がないときの既定。`echo` / `azure_openai` |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_DEPLOYMENT` | 空 | `azure_openai` のとき必須。デプロイ名は chat completions の URL のモデル名になる |
| `TIKA_SERVER_JAR` | Docker では `/opt/tika-server.jar`。ホストでは未設定 | Apache Tika のサーバーの jar。設定があると、旧形式の Office（`.doc`・`.xls`・`.ppt`）・RTF・HTML・EPUB・HWP など（専用のプロセッサが読まない形式）の取り出しに、必要になったとき（遅延起動）に起動して使う。未設定ならテキスト系の形式だけを自前で読む。詳細は [generative-ai-adapter の README](../generative-ai-adapter/README.md#apache-tika-の呼び方移植元との違い) |
| `TIKA_URL` | 未設定 | 別に起動してある Tika のサーバーを使う（起動しない）。`TIKA_SERVER_JAR` より優先 |
| `TIKA_HEAP` / `TIKA_PORT` / `TIKA_JAVA_COMMAND` | `256m` / `9998` / `java` | 起動する Tika の子の JVM のヒープ上限・待ち受けポート（`127.0.0.1`）・JRE のコマンド |
| `TIKA_START_TIMEOUT_SECONDS` / `TIKA_REQUEST_TIMEOUT_SECONDS` | `60` / `120` | 起動を待つ時間・1 回の取り出しの時間 |
| `LOG_LEVEL` | `INFO` | ログレベル |

## 開発

```bash
cd waha-emulator
uv sync
uv run pytest          # LLM は偽物か echo（HTTP はモック）。server-local との結合テストも含む
uv run ruff check . && uv run ruff format --check .
uv run mypy
```

- `tests/test_server_local_roundtrip.py` は、リポジトリの `secuaigent-server-local/` を読み込み、server-local の `WahaClient` とアプリ（SSE・同期 API）から ASGI でエミュレーターを呼ぶ。server-local の Waha! の呼び方が変わったら、ここで食い違いが分かる
- チャット 1 回でどの部品がどの順に動いたかのログの読み方と、Docker での通しの確認手順は [generative-ai-adapter/README.md](../generative-ai-adapter/README.md)

## 設計メモ

- API は `secuaigent-server-local/app/clients/waha_client.py`（移植元 `ServiceRunService` の移植）が使うものだけを、同じパス・パラメータ・応答で作っている
- `server/`・`secuaigent-server-local/` とは独立したプロジェクトで、コードは共有しない（テストだけ `secuaigent-server-local/` を読み込む）。生成AIアダプタだけは `../generative-ai-adapter/generative-ai-adapter` をパス依存で使う（core も一緒に入る）
- 経緯: 土台は Issue #274、アダプタの差し込みは #298（生成AIアダプタ。通常チャットと RAG 回答）・#300（埋め込みアダプタ。ベクトルDB は PostgreSQL + pgvector）・#299（検索アダプタ。RAG の前段に差し込める）。設計は [docs/issue-274](../docs/issue-274/)・[docs/issue-298](../docs/issue-298/)
- 管理用 API を作り変える前の状態には、タグ `waha-emulator-before-studio` で戻せる
