# generative-ai-adapter

Waha!（ユニリタの ETL 製品）に組み込む生成AIアダプタの Python 移植（Issue #298）。移植元は `secuaigent/generative-ai-adapter/`（Java。`generative-ai-core`・`generative-ai-adapter`・`embedding-adapter`・`retrieval-adapter` の 4 プロジェクト）。

アダプタは**サーバーではなくライブラリ**。`waha-emulator/`（Waha! の代わりのサービス）のワークフローから import して、Waha! の呼び方（`set_property` → `connect` → `before_execute` → `write`）のまま呼ぶ。

- 移植元の構造・判断の根拠は [docs/issue-298](../docs/issue-298/)
- 実際の LLM には接続しない自動テストが付いている（HTTP はモック）

## 構成

uv のワークスペース（このディレクトリがルート）。移植元と同じ 4 つの分け方にし、いま移植したのは上 2 つ。

| ディレクトリ | パッケージ | 役割 | 状況 |
|---|---|---|---|
| `generative-ai-core/` | `generative_ai_core` | Waha! に依存しない共通 runtime。chat・RAG・画像説明、プロバイダ（OpenAI・Azure OpenAI・SecuAiGent など）、ネットワーク（プロキシ・SSL・タイムアウト）、ファイル前処理（テキスト・画像・PDF・Word・Excel・PowerPoint）、埋め込み（embedding）、ベクトルDB（vector）、Graph Candidate の取り込み（graphrag の ingestion・bootstrap） | chat・provider・network・media・embedding・vector・graphrag（ingestion・bootstrap）を移植。検索側（retrieval・検索で使う graphrag）は #299 |
| `generative-ai-adapter/` | `generative_ai_adapter` | Waha! の生成AIアダプタ本体。通常チャット（出力モード 0・2）と RAG 回答（その他）を core に任せ、`RetrievalAnswer` の JSON を書く | 移植（ログ出力先・HTTP クライアントの互換部分・Office/PDF の薄い層を除く） |
| `embedding-adapter/` | `embedding_adapter` | Waha! の埋め込みアダプタ本体。入力ファイルを core の前処理でテキストにして分割し、ベクトルDB（PostgreSQL + pgvector / Azure AI Search）に保存・削除する。Graph 書き込みが有効なら Graph Candidate（LLM で候補を抽出して AGE グラフに書く）も行う | 移植（#300）。詳細は下の「埋め込みアダプタ」 |
| `retrieval-adapter/` | `retrieval_adapter` | Waha! の検索アダプタ本体。質問からベクトル・ハイブリッド（PGroonga）・Graph RAG（AGE）で検索し、`LEGACY_TSV`（出力モード 0）か `RAG_CONTEXT_JSON_V1`（出力モード 1）で書く。core の `retrieval` に任せる | 移植（Docs は docs/issue-299） |

**ワークスペースにした理由**: core と adapter を別パッケージ（移植元の Maven プロジェクトと同じ依存の向き: adapter → core）にしたまま、`uv run pytest` で 2 つのテストを一度に動かせる。エミュレーターは adapter だけをパス依存（`../generative-ai-adapter/generative-ai-adapter`）で入れ、core は adapter の依存として一緒に入る。Docker ビルドは、ルートをビルドコンテキストにして両方をイメージへコピーする（`waha-emulator/Dockerfile`）。

### Waha! 固有の部分の置き換え

| 移植元（Waha!） | Python 版 |
|---|---|
| 番号付きプロパティ（`PropertyIds`） | 同じ番号の `PropertyIds` と文字列の値で `App.set_property(id, value)` へ渡す |
| `ColumnData[]`・`ColumnInformation[]`（ロールは index） | `generative_ai_adapter.waha` の `ColumnData`・`ColumnInformation`。index の意味は移植元と同じ（0 ユーザー、1 システム、2 アシスタント、3 ファイルパス、4 会話履歴 Json、5 コンテクスト、6 RAG Context JSON パス） |
| 出力ファイル（`OUTPUT_DIR/<ビュー名>`） | 同じ。エミュレーターがジョブごとの一時ディレクトリに作り、読んで `outputfile` にする |
| 推論の途中経過ファイル（プロパティ 42） | 同じ。`ReasoningOutputSink` が `data:{"type":"reasoning_delta","text":"…"}` を追記する |
| `LoggerConfig`（`WAHA_GENERATIVE_AI_LOG_*` のファイル出力） | 標準の `logging`（INFO）。出力先はエミュレーターが決める |
| Apache Tika・Spring AI | 簡易な MIME 判定とテキスト読み込み、`httpx` による chat completions の直接呼び出し（詳細は docs/issue-298/03） |

## 開発

```bash
cd generative-ai-adapter
uv sync
uv run pytest -q
uv run ruff check . && uv run ruff format --check .
uv run mypy generative-ai-core && uv run mypy generative-ai-adapter && uv run mypy retrieval-adapter && uv run mypy embedding-adapter   # tests に同名の conftest.py があるため別々に実行する
```

- docstring は NumPy 形式（日本語。`Parameters`・`Returns`・`Raises`）。ruff の D ルール（numpy）を `pyproject.toml` で有効にしている
- テストは移植元の Java のテスト（`src/test`）のうち今回の範囲に当たるものを移したもの。各テストファイルの先頭に、どの Java のテストを移したかを書いている
- 実際の LLM には接続しない。OpenAI・Azure・SecuAiGent の HTTP は `respx` でモックする

## 埋め込みアダプタ（`embedding-adapter/`、#300）

移植元の `embedding-adapter`（Waha! の「生成AI学習」アダプタ）の Python 移植。生成AIアダプタと同じく**ライブラリ**で、エミュレーターのワークフローから Waha! の呼び方のまま使う。

```text
set_property → connect(出力モード) → set_column_information → set_view_name → before_execute → write(レコード) → after_execute
```

| 出力モード（`connect`） | 動き |
|---|---|
| 0 テキスト出力 | 分割した本文を TSV（`OUTPUT_DIR/<ビュー名>`）に書くだけ。ベクトルDB には書かない |
| 1 VDB追加登録 | 分割したチャンクごとに埋め込みを作り、ベクトルDB に追加。テーブルは作らない |
| 3 VDB新規登録 | 1 と同じ。テーブルがなければ作る（あれば消さずに追記する） |
| 2 VDB削除 | ID 列のファイル ID に紐づく行をベクトルDB から削除する |

- 列は ID（文字）・入力ファイル（FILE）・分割文字数（DECIMAL_NUMBER）の 3 つ。分割は「行を足していき、分割文字数を超えたら区切る」移植元どおり
- TSV の 1 行は `"入力ファイルのパス"<TAB>"本文"<TAB>"ベクトルDB の行 ID（パート ID）"<TAB>"ファイル ID"`（ファイルごとにアダプタが採番する UUID）
- 入力ファイルの前処理は core の media（テキスト・画像・PDF・Word・Excel・PowerPoint）。画像説明（プロパティ 32）は core の chat で行う
- プロパティ番号・名前は `embedding_adapter.constants.PropertyIds`（移植元の `properties.xml` と `App#setProperty` の case と同じ番号）。Python 版だけの追加は、`VENDOR=99`（Echo。キーなしで動く確認用の埋め込みで、文字列から決まる 1536 次元の単位ベクトルを返す）

### 移植元と挙動を変えた点

| 点 | 内容 |
|---|---|
| 削除のテナント ID | 移植元は Graph candidate 用の接続設定からだけテナント ID を受け取るため、Graph 書き込みが無効だと削除（テナント必須）が必ず失敗する。埋め込みの接続設定（プロパティ 3）で補う（`CoreDelegatingVectorStoreService.use_tenant_id_if_unset`） |
| Graph の取り込みテナント | 移植元は取り込みのテナントを `tenant-default` に固定している（`IngestionCoreMapper`）。削除はプロパティ 3 のテナントで GraphRAG 側を消すため、Graph 書き込みを有効にするときはプロパティ 3 を `tenant-default` にしないと GraphRAG 側の行が残る（移植元どおり） |
| 削除に必要な GraphRAG のスキーマ | 移植元は削除のたびに GraphRAG のスキーマ（`graphrag_s02`）を参照するが、スキーマを作るのは Graph 書き込みが有効な取り込みだけ。エミュレーターの削除ワークフローが事前に作る（アダプタ自体は移植元どおり） |
| JDBC | psycopg 3 で接続（自動コミット）。移植元の Spring・Azure SDK・Tika・POI・PDFBox は Python の標準的な手段に置き換えた（差は docs/issue-300/03） |
| PowerPoint の画像説明（ページ全体） | Python に描画の手段がなく `RENDERING_FAILURE` にする（埋め込み画像の説明は動く） |

### 実 DB での確認

`onprem/vector-db` のイメージ（pgvector + PGroonga + Apache AGE）で確認できる。自動テストは DB に接続しない（偽の接続）。

```bash
docker build -t naw-onprem-vector-db onprem/vector-db
docker run -d --name naw-vdb -e POSTGRES_DB=onprem_vector -e POSTGRES_USER=onprem_vector \
  -e POSTGRES_PASSWORD=onprem_vector_password -p 127.0.0.1:35432:5432 \
  -v "$PWD/onprem/vector-db/init:/docker-entrypoint-initdb.d:ro" naw-onprem-vector-db
```

接続先は `VDB_URL=127.0.0.1:35432`・`VDB_USER_NAME=onprem_vector`・`VDB_PASSWORD=onprem_vector_password`・`VDB_DATABASE_NAME=onprem_vector`・`VDB_TABLE_NAME=<テーブル名>`、`VDB_VENDOR=PostgreSQL(PGVector)`。

## プロバイダ

| `VENDOR`（プロパティ 30） | 動作 |
|---|---|
| `0` OpenAI | `{URL}/v1/chat/completions` を非ストリーミングで呼ぶ（`Authorization: Bearer`）。推論の途中経過は出ない |
| `1` AzureOpenAI | `{URL}/openai/deployments/{モデル名}/chat/completions?api-version=2025-01-01-preview`（`api-key`） |
| `5` SecuAiGent | クラウドの `POST {URL}/api/llm/chat`（multipart + SSE）。`API_KEY` は loginKey（`/auth/login-key` で JWT を取る）、`Tenant ID` は `X-Tenant-ID`。推論・ライブラリ生成の途中経過を受け取る。tools・textData に対応 |
| `2` Anthropic・`3` VertexAI・`4` GoogleAIStudio | 移植元と同じく「未対応」の理由付き失敗（`UNSUPPORTED_PROVIDER_CAPABILITY`） |
| `99` Echo（Python 版だけ） | キーなし。質問をそのまま回答にし、8 文字ずつ `reasoning_delta` も流す。確認用 |

## チャット 1 回でどの部品がどの順に動いたかを見る

エミュレーターは起動時に `LOG_LEVEL=INFO`（既定）で、チャット 1 回の流れを部品ごとのログに出す。ログの `[]` の中が部品（ロガー名）で、上から順に動いた順。Docker なら `docker logs naw-waha-emulator`（ホスト実行なら標準出力）。`LOG_LEVEL=DEBUG` で HTTP の詳細も見られる。

server-local から「こんにちは、通しの確認です」（履歴 2 件付き、アシスタント ID `gpt-4o`、Echo）を送ったときの実際のログ（時刻・セッション ID は省略。`←` は説明）:

```
[waha_emulator.routers.servicerun] Session started                       ← server-local が startsession
[waha_emulator.routers.servicerun] File uploaded: slot=textdata, ...     ← 入力スロットを受け取る
[waha_emulator.routers.servicerun] File uploaded: slot=question, ...
[waha_emulator.routers.servicerun] File uploaded: slot=history, ...
[waha_emulator.routers.servicerun] Execute: serviceId=gpt-4o, workflow=GenerativeAiWorkflow, params={'streamfilepath': '/app/data/stream-output/….txt'}
                                                                         ← serviceId で選ばれたワークフロー
[waha_emulator.workflows.generative_ai] workflow generative-ai: serviceId=gpt-4o, outputType=0, vendor=Echo, model=echo, columns=[(0, 'CHAR'), (0, 'FILE'), (4, 'FILE')], properties=[…]
                                                                         ← スロット → アダプタの列・プロパティ（値は出さない）
[generative_ai_adapter.app] beforeExecute: vendor=Echo, textData=True, textDataFailure=False, tools=0, ...
                                                                         ← textData・tools の解決
[generative_ai_adapter.controller] controller ready: provider=Echo, model=echo, outputType=0, tools=0
[generative_ai_adapter.app] write: route=chat, outputType=0              ← 通常チャット（outputType 0・2）か RAG か
[generative_ai_adapter.request_schema_factory] filePath: null / 履歴ファイルのfilePath: …/histories.json
                                                                         ← 列 → メッセージ（添付なし・履歴あり）
[generative_ai_adapter.reasoning_output_sink] reasoning output opened    ← 途中経過ファイル（プロパティ 42）を追記で開く
[generative_ai_adapter.controller] executeLLM: messages=3                ← 履歴 2 + 質問 1
[generative_ai_core.chat.runtime] core chat: provider=Echo, messages=3, tools=0, outputMode=RETRIEVAL_ANSWER_JSON
[generative_ai_core.provider.clients.echo] echo chat: answerChars=13     ← プロバイダ（Azure なら provider request/response のログ）
[generative_ai_core.chat.runtime] core chat finished: answerPresent=True, answerChars=13, referenceIds=[]
[generative_ai_adapter.controller] output written: chars=80              ← 出力ファイル（RetrievalAnswer の JSON）を書く
[generative_ai_adapter.reasoning_output_sink] reasoning output closed: deltas=2
[waha_emulator.jobs] Job succeeded                                       ← outputfile を保存し、ストリームに completed を書く
[waha_emulator.routers.servicerun] Session ended                         ← server-local が endsession
```

- RAG では `write: route=rag` の後に `executeLLMWithContext: messages=…, contexts=…`、`core rag: …`、SecuAiGent・OpenAI・Azure ではプロバイダが回答 1 回と検証 1 回の 2 回呼ばれるログ（`purpose=rag-answer`・`rag-validation`）が続く。入力不足のときは `RAG input deficiency: …` が出て、core は呼ばれない
- 途中経過ファイル（推論の差分）は server-local の `data/stream-output/<メッセージ ID>.txt` で見られる（`data:{"type":"reasoning_delta",…}` の行と、最後の `completed`）

## Docker で server-local → エミュレーター → アダプタを通して確かめる

server-local のコンテナがエミュレーターを呼び、エミュレーターのコンテナの中でアダプタが動く。ストリームファイルは両方のコンテナが同じパス（`/app/data/stream-output`）で見る。ポートが他で使われていたら `*_PORT` を変える（下は 8091・8090）。

```bash
# 0. 共有するディレクトリを先に作る（Docker に作らせると root 所有になる）
mkdir -p server-local/data/stream-output

# 1. エミュレーター（アダプタを含めてビルドされる。ビルドコンテキストはリポジトリのルート）
cd waha-emulator
cp .env.example .env     # WAHA_AUTHKEY=local-key にする（LLM_PROVIDER=echo のままでよい）
docker compose up -d --build

# 2. server-local
cd ../server-local
cp .env.example .env     # SECURITY_SERVER_AUTH_KEY=server-key、WAHA_URL=http://host.docker.internal:8091/、WAHA_AUTHKEY=local-key
docker compose up -d --build

# 3. 通しで確かめる（履歴付き）
curl -N -H "X-SERVER-AUTH-KEY: server-key" \
  -F 'textData={"assistantId":"gpt-4o","messageId":"m-1","userInput":"こんにちは","historyMessages":[{"type":"USER","content":"前の質問"},{"type":"ASSISTANT","content":"前の回答"}]};type=application/json' \
  http://localhost:8090/api/messages/content
# → data:{"type":"reasoning_delta","text":"こんにちは"} … text_delta … message_stop … message_content（answer が「こんにちは」）

# 4. アダプタの動きを見る
docker logs naw-waha-emulator           # 上のログ
ls server-local/data/stream-output/     # 途中経過ファイル
```

サービス ID ごとにアダプタの設定を変える（RAG・回答本文だけの出力・Azure OpenAI など）には、`waha-emulator/.env` に `WAHA_WORKFLOWS_FILE=/app/config/workflows.example.json` を設定して再起動し、`assistantId` を `echo-rag`（RAG 回答。RAG Context JSON の内容が `context`・`referencePaths` に入る）にして送る。`echo-plain` は回答の本文だけを返す設定（出力モード 2）で、server-local は回答を JSON として読むためエラーになる（エミュレーターの API を直接呼ぶ確認用）。形式は [waha-emulator/README.md](../waha-emulator/README.md) の「ワークフローの設定」を参照。

実際の LLM（Azure OpenAI）に向けるときは、`waha-emulator/.env` の `LLM_PROVIDER=azure_openai` と `AZURE_OPENAI_*`、または `WAHA_WORKFLOWS_FILE` の定義の `VENDOR`・`URL`・`API_KEY`（`${環境変数}` で参照）・`MODEL_NAME` を設定する。

## 検索アダプタ（retrieval-adapter, #299）

RAG チャットは「検索 → 生成AI」の順に 2 つのアダプタを動かす（本物の Waha! のジョブで 2 つを並べるのと同じ）。エミュレーターは、定義に `retrieval` があるサービスで、検索アダプタを出力モード 1 で動かして RAG Context JSON をジョブのディレクトリに書かせ、そのパスを生成AIアダプタの列 index 6（`RAG_CONTEXT_JSON_ALLOW_ROOT` もジョブのディレクトリ）に渡す。

| 検索 | 条件 | 使うもの |
|---|---|---|
| ベクトル | 既定 | PostgreSQL（pgvector）。`public.<テーブル>` を `embedding <=> クエリ` の近い順 |
| ハイブリッド | プロパティ 47 = `1`（PostgreSQL のみ） | 上に PGroonga の全文検索を RRF でまとめ、プロバイダ LLM でリランク（プロパティ 53 = `0` で無効）。PGroonga の拡張・インデックス・実行計画が揃わなければ失敗（ベクトルだけの成功にしない） |
| Graph RAG | プロパティ 45 = `1`（PostgreSQL のみ） | `graphrag_s01`・`graphrag_s02` と AGE の graph が揃っているか読み取りで確かめ、AGE で前後のチャンク・業務上の関係を広げる |
| Azure AI Search | VDB プロバイダ 0 | 移植元のマッパーの都合で、プロパティ 31 = `0`（Azure AI Search）は検索プロバイダが未対応になる（core の Azure AI Search 検索は `AzureOpenAI` を渡すテストで確認）。移植元と同じ |

- クエリの埋め込みは、プロパティ 30（OpenAI・AzureOpenAI・SecuAiGent）の埋め込み API。**Python 版だけ** `99`（Echo）は HTTP なしの擬似ベクトル（文字 2-gram のハッシュ。同じ文章は同じベクトル）で、キーなしで動かせる
- 動かして理解する手順（Docker の `onprem/vector-db` を使う）と、チャット 1 回のログの読み方は [docs/issue-299/08_動作確認.md](../docs/issue-299/08_動作確認.md) と [waha-emulator/README.md](../waha-emulator/README.md)
- 実 DB の確認用テスト: `NAW_RETRIEVAL_REAL_DB=127.0.0.1:15432 uv run pytest generative-ai-core/tests/test_retrieval_real_postgres.py`（通常は skip。`onprem/vector-db` と同じ構成の DB が必要）
