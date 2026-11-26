# generative-ai-adapter

Waha!（ユニリタの ETL 製品）に組み込む、生成AI・検索・埋め込みのアダプタの Python 移植（Issue #298・#299・#300）。
アダプタは**サーバーではなくライブラリ**。`waha-emulator/`（Waha! の代わりのサービス）のワークフローから import して、Waha! の呼び方（`set_property` → `connect` → `before_execute` → `write`）のまま呼ぶ。

- 移植元は `secuaigent/generative-ai-adapter/`（Java。`generative-ai-core`・`generative-ai-adapter`・`embedding-adapter`・`retrieval-adapter` の 4 プロジェクト）。移植元の構造・判断の根拠は [docs/issue-298](../docs/issue-298/)
- 実際の LLM には接続しない自動テストが付いている（HTTP はモック）

読み手別の入口:

- 初めて動かす: 「開発」→「Docker で server-local → エミュレーター → アダプタを通して確かめる」
- 動きを追う・保守する: 「チャット 1 回でどの部品がどの順に動いたかを見る」「実 DB での確認」
- 設計を知る: 「構成」以降（プロバイダ・埋め込み・検索・Tika・Bedrock の拡張・移植元との違い）

## 開発

uv のワークスペース（このディレクトリがルート）。

```bash
cd generative-ai-adapter
uv sync
uv run pytest -q
uv run ruff check . && uv run ruff format --check .
uv run mypy generative-ai-core && uv run mypy generative-ai-adapter && uv run mypy retrieval-adapter && uv run mypy embedding-adapter   # tests に同名の conftest.py があるため別々に実行する
```

- docstring は NumPy 形式（日本語。`Parameters`・`Returns`・`Raises`）。ruff の D ルール（numpy）を `pyproject.toml` で有効にしている
- テストは、移植元の Java のテスト（`src/test`）のうち今回の範囲に当たるものを移したもの。各テストファイルの先頭に、どの Java のテストを移したかを書いている
- 実際の LLM には接続しない。OpenAI・Azure・SecuAiGent の HTTP は `respx` でモックする

## Docker で server-local → エミュレーター → アダプタを通して確かめる

起動・停止と、基本の質問の `curl` は [onprem/README.md](../onprem/README.md) に書いてある。server-local・エミュレーター・ベクトルDB をまとめて起動し、接続先・認証キー・ストリームファイルの共有は設定済み。ここには、アダプタの確認に固有のことだけを書く。

```bash
cd onprem
docker compose up -d --build   # すべて healthy になるまで待つ（docker compose ps）

# 履歴付きの質問（onprem の既定の値: ポート 18090、キー onprem-local-key）
curl -N -H "X-SERVER-AUTH-KEY: onprem-local-key" \
  -F 'textData={"assistantId":"onprem-chat","messageId":"m-1","userInput":"こんにちは","historyMessages":[{"type":"USER","content":"前の質問"},{"type":"ASSISTANT","content":"前の回答"}]};type=application/json' \
  http://localhost:18090/api/messages/content
# → data:{"type":"reasoning_delta","text":"こんにちは"} … text_delta … message_stop … message_content（LLM が echo のとき、answer が「こんにちは」。Bedrock などに向けているときは、LLM の答えが入る）

# アダプタの動きを見る
docker compose logs waha-emulator                                # 下の「チャット 1 回の…」のログ
docker compose exec waha-emulator ls /app/data/stream-output     # 途中経過ファイル（`<応答の message_content の id>.txt`。curl の `messageId` ではない。named volume なのでホストのディレクトリには出ない）
```

サービス ID ごとにアダプタの設定を変える（RAG・回答本文だけの出力・Azure OpenAI など）には、次のようにする。

1. `onprem/.env` に `WAHA_WORKFLOWS_FILE=/app/config/workflows.example.json` を設定する
2. `docker compose up -d` で作り直す
3. `assistantId` を次のどちらかにして送る
   - `echo-rag`: RAG 回答。RAG Context JSON の内容が `context`・`referencePaths` に入る
   - `echo-plain`: 回答の本文だけを返す設定（出力モード 2）。server-local は回答を JSON として読むためエラーになる。エミュレーターの API を直接呼ぶ確認用

設定ファイルの形式は [waha-emulator/README.md](../waha-emulator/README.md) の「ワークフローの設定」を参照。

実際の LLM（Azure OpenAI）に向けるときは、次のどちらかを設定する（項目は `onprem/.env.example` にある）。

- `onprem/.env` の `LLM_PROVIDER=azure_openai` と `AZURE_OPENAI_*`
- `WAHA_WORKFLOWS_FILE` の定義の `VENDOR`・`URL`・`API_KEY`（`${環境変数}` で参照）・`MODEL_NAME`

## チャット 1 回でどの部品がどの順に動いたかを見る

エミュレーターは起動時に `LOG_LEVEL=INFO`（既定）で、チャット 1 回の流れを部品ごとのログに出す。ログの `[]` の中が部品（ロガー名）で、上から順に動いた順。

- Docker なら `onprem/` で `docker compose logs waha-emulator`（ホスト実行なら標準出力）
- `LOG_LEVEL=DEBUG` で HTTP の詳細も見られる

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

- RAG では `write: route=rag` の後に、次のログが続く
  - `executeLLMWithContext: messages=…, contexts=…` と `core rag: …`
  - SecuAiGent・OpenAI・Azure では、プロバイダが回答 1 回と検証 1 回の計 2 回呼ばれるログ（`purpose=rag-answer`・`rag-validation`）
  - 入力不足のときは `RAG input deficiency: …` が出て、core は呼ばれない
- 途中経過ファイル（推論の差分）は、server-local の `data/stream-output/<メッセージ ID>.txt` で見られる（`data:{"type":"reasoning_delta",…}` の行と、最後の `completed`）

## 実 DB での確認

自動テストは DB に接続しない（偽の接続）。実 DB で確かめるには、`onprem/vector-db` のイメージ（pgvector + PGroonga + Apache AGE）を使う。

```bash
docker build -t naw-onprem-vector-db onprem/vector-db
docker run -d --name naw-vdb -e POSTGRES_DB=onprem_vector -e POSTGRES_USER=onprem_vector \
  -e POSTGRES_PASSWORD=onprem_vector_password -p 127.0.0.1:35432:5432 \
  -v "$PWD/onprem/vector-db/init:/docker-entrypoint-initdb.d:ro" naw-onprem-vector-db
```

接続先（環境変数）:

- `VDB_URL=127.0.0.1:35432`
- `VDB_USER_NAME=onprem_vector`
- `VDB_PASSWORD=onprem_vector_password`
- `VDB_DATABASE_NAME=onprem_vector`
- `VDB_TABLE_NAME=<テーブル名>`
- `VDB_VENDOR=PostgreSQL(PGVector)`

検索の実 DB 確認用テストは「検索アダプタ」の節を参照。

## 構成

uv のワークスペース。移植元と同じ 4 つの分け方で、4 つとも移植済み。

| ディレクトリ | パッケージ | 役割 |
|---|---|---|
| `generative-ai-core/` | `generative_ai_core` | Waha! に依存しない共通 runtime |
| `generative-ai-adapter/` | `generative_ai_adapter` | 生成AIアダプタ本体 |
| `embedding-adapter/` | `embedding_adapter` | 埋め込みアダプタ本体 |
| `retrieval-adapter/` | `retrieval_adapter` | 検索アダプタ本体 |

- `generative-ai-core/`
  - 含むもの: chat・RAG・画像説明、プロバイダ（OpenAI・Azure OpenAI・SecuAiGent など）、ネットワーク（プロキシ・SSL・タイムアウト）、ファイル前処理（テキスト・画像・PDF・Word・Excel・PowerPoint）、埋め込み（embedding）、ベクトルDB（vector）、Graph Candidate の取り込み（graphrag の ingestion・bootstrap）
  - 移植範囲: chat・provider・network・media・embedding・vector・graphrag（ingestion・bootstrap）。検索側（retrieval・検索で使う graphrag）は #299
- `generative-ai-adapter/`: Waha! の生成AIアダプタ本体。通常チャット（出力モード 0・2）と RAG 回答（その他）を core に任せ、`RetrievalAnswer` の JSON を書く。移植したが、ログ出力先・HTTP クライアントの互換部分・Office/PDF の薄い層は除く
- `embedding-adapter/`: Waha! の埋め込みアダプタ本体（#300）。入力ファイルを core の前処理でテキストにして分割し、ベクトルDB（PostgreSQL + pgvector / Azure AI Search）に保存・削除する。Graph 書き込みが有効なら、Graph Candidate（LLM で候補を抽出して AGE グラフに書く）も行う。詳細は「埋め込みアダプタ」
- `retrieval-adapter/`: Waha! の検索アダプタ本体（#299）。質問からベクトル・ハイブリッド（PGroonga）・Graph RAG（AGE）で検索し、`LEGACY_TSV`（出力モード 0）か `RAG_CONTEXT_JSON_V1`（出力モード 1）で書く。core の `retrieval` に任せる。Docs は docs/issue-299

**ワークスペースにした理由**: core と adapter を別パッケージ（移植元の Maven プロジェクトと同じ依存の向き: adapter → core）にしたまま、`uv run pytest` で複数のパッケージのテストを一度に動かせる。

- エミュレーターは adapter・retrieval・embedding の 3 つをパス依存（`../generative-ai-adapter/<各ディレクトリ>`）で入れる。core はそれらの依存として一緒に入る
- Docker ビルドは、ルートをビルドコンテキストにして各パッケージをイメージへコピーする（`waha-emulator/Dockerfile`）

### Waha! 固有の部分の置き換え

| 移植元（Waha!） | Python 版 |
|---|---|
| 番号付きプロパティ（`PropertyIds`） | 同じ番号の `PropertyIds` と文字列の値で `App.set_property(id, value)` へ渡す |
| `ColumnData[]`・`ColumnInformation[]` | `generative_ai_adapter.waha` の `ColumnData`・`ColumnInformation`（ロールは index。下記） |
| 出力ファイル（`OUTPUT_DIR/<ビュー名>`） | 同じ。エミュレーターがジョブごとの一時ディレクトリに作り、読んで `outputfile` にする |
| 推論の途中経過ファイル（プロパティ 42） | 同じ。`ReasoningOutputSink` が `data:{"type":"reasoning_delta","text":"…"}` を追記する |
| `LoggerConfig`（`WAHA_GENERATIVE_AI_LOG_*` のファイル出力） | 標準の `logging`（INFO）。出力先はエミュレーターが決める |
| Apache Tika・Spring AI | 簡易な MIME 判定とテキスト読み込み、`httpx` による chat completions の直接呼び出し（詳細は docs/issue-298/03） |

列の index の意味は移植元と同じ: 0 ユーザー、1 システム、2 アシスタント、3 ファイルパス、4 会話履歴 Json、5 コンテクスト、6 RAG Context JSON パス。

## プロバイダ

`VENDOR`（プロパティ 30）ごとの動作。

- `0` OpenAI: `{URL}/v1/chat/completions` を非ストリーミングで呼ぶ（`Authorization: Bearer`）。推論の途中経過は出ない
- `1` AzureOpenAI: `{URL}/openai/deployments/{モデル名}/chat/completions?api-version=2025-01-01-preview`（`api-key`）
- `5` SecuAiGent: クラウドの `POST {URL}/api/llm/chat`（multipart + SSE）
  - `API_KEY` は loginKey（`/auth/login-key` で JWT を取る）、`Tenant ID` は `X-Tenant-ID`
  - 推論・ライブラリ生成の途中経過を受け取る。tools・textData に対応
- `2` Anthropic・`3` VertexAI・`4` GoogleAIStudio: 移植元と同じく「未対応」の理由付き失敗（`UNSUPPORTED_PROVIDER_CAPABILITY`）
- `97` Bedrock（Python 版だけ）: Bedrock Mantle の Anthropic 形式の入口 `{URL}/v1/messages` を非ストリーミングで呼ぶ。**移植元にない拡張**（「移植元にない拡張」の節）<!-- bedrock-ext -->
  - 認証は `Authorization: Bearer` と `anthropic-version`。`x-api-key` は付けない（Mantle が両方あると拒否するため）
  - `URL` は `https://bedrock-mantle.<リージョン>.api.aws/anthropic`、`API_KEY` は Bedrock API key、`MODEL_NAME` は `anthropic.claude-haiku-4-5` など
  - RAG の回答・検証の返答は、コードフェンスや前後の説明文があっても、中の JSON を取り出して読む（Claude は JSON をフェンスで包んで返すため）
- `99` Echo（Python 版だけ）: キーなし。質問をそのまま回答にし、8 文字ずつ `reasoning_delta` も流す。確認用

## 埋め込みアダプタ（`embedding-adapter/`、#300）

移植元の `embedding-adapter`（Waha! の「生成AI学習」アダプタ）の Python 移植。生成AIアダプタと同じく**ライブラリ**で、エミュレーターのワークフローから Waha! の呼び方のまま使う。

```text
set_property → connect(出力モード) → set_column_information → set_view_name → before_execute → write(レコード) → after_execute
```

出力モード（`connect`）:

- `0` テキスト出力: 分割した本文を TSV（`OUTPUT_DIR/<ビュー名>`）に書くだけ。ベクトルDB には書かない
- `1` VDB追加登録: 分割したチャンクごとに埋め込みを作り、ベクトルDB に追加。テーブルは作らない
- `3` VDB新規登録: 1 と同じ。テーブルがなければ作る（あれば消さずに追記する）
- `2` VDB削除: ID 列のファイル ID に紐づく行を、ベクトルDB から削除する

- 列は ID（文字）・入力ファイル（FILE）・分割文字数（DECIMAL_NUMBER）の 3 つ。分割は「行を足していき、分割文字数を超えたら区切る」移植元どおり
- TSV の 1 行は `"入力ファイルのパス"<TAB>"本文"<TAB>"ベクトルDB の行 ID（パート ID）"<TAB>"ファイル ID"`。ファイル ID は、ファイルごとにアダプタが採番する UUID
- 入力ファイルの前処理は core の media（テキスト・画像・PDF・Word・Excel・PowerPoint）。画像説明（プロパティ 32）は core の chat で行う
- プロパティ番号・名前は `embedding_adapter.constants.PropertyIds`（移植元の `properties.xml` と `App#setProperty` の case と同じ番号）
- Python 版だけの追加は、`VENDOR=97`（Bedrock）と `VENDOR=99`（Echo。キーなしで動く確認用の埋め込みで、文字列から決まる 1536 次元の単位ベクトルを返す）

### 移植元と挙動を変えた点

- **削除のテナント ID**: 移植元は、Graph candidate 用の接続設定からだけテナント ID を受け取る。そのため Graph 書き込みが無効だと、削除（テナント必須）が必ず失敗する。Python 版は、埋め込みの接続設定（プロパティ 3）で補う（`CoreDelegatingVectorStoreService.use_tenant_id_if_unset`）
- **Graph の取り込みテナント**: 移植元は、取り込みのテナントを `tenant-default` に固定している（`IngestionCoreMapper`）。削除はプロパティ 3 のテナントで GraphRAG 側を消すため、Graph 書き込みを有効にするときはプロパティ 3 を `tenant-default` にしないと、GraphRAG 側の行が残る（移植元どおり）
- **削除に必要な GraphRAG のスキーマ**: 移植元は削除のたびに GraphRAG のスキーマ（`graphrag_s02`）を参照するが、スキーマを作るのは Graph 書き込みが有効な取り込みだけ。エミュレーターの削除ワークフローが事前に作る（アダプタ自体は移植元どおり）
- **JDBC**: psycopg 3 で接続する（自動コミット）。移植元の Spring・Azure SDK・Tika・POI・PDFBox は、Python の標準的な手段に置き換えた（差は docs/issue-300/03）
- **PowerPoint の画像説明（ページ全体）**: Python に描画の手段がなく `RENDERING_FAILURE` にする（埋め込み画像の説明は動く）

## 検索アダプタ（retrieval-adapter, #299）

RAG チャットは「検索 → 生成AI」の順に 2 つのアダプタを動かす（本物の Waha! のジョブで 2 つを並べるのと同じ）。エミュレーターは、定義に `retrieval` があるサービスで、次のように動かす。

1. 検索アダプタを出力モード 1 で動かし、RAG Context JSON をジョブのディレクトリに書かせる
2. そのパスを、生成AIアダプタの列 index 6 に渡す（`RAG_CONTEXT_JSON_ALLOW_ROOT` もジョブのディレクトリ）

検索の種類:

- **ベクトル**（既定）: PostgreSQL（pgvector）。`public.<テーブル>` を `embedding <=> クエリ` の近い順に読む
- **ハイブリッド**（プロパティ 47 = `1`。PostgreSQL のみ）
  - ベクトル検索に PGroonga の全文検索を RRF（順位の統合）でまとめ、プロバイダ LLM でリランクする。プロパティ 53 = `0` でリランクは無効
  - PGroonga の拡張・インデックス・実行計画が揃わなければ失敗する（ベクトルだけの成功にしない）
- **Graph RAG**（プロパティ 45 = `1`。PostgreSQL のみ）: `graphrag_s01`・`graphrag_s02` と AGE の graph が揃っているか読み取りで確かめ、AGE で前後のチャンク・業務上の関係を広げる
- **Azure AI Search**（VDB プロバイダ 0）: 移植元のマッパーの都合で、プロパティ 31 = `0`（Azure AI Search）は検索プロバイダが未対応になる。移植元と同じ。core の Azure AI Search 検索は、`AzureOpenAI` を渡すテストで確認している

その他:

- クエリの埋め込みは、プロパティ 30（OpenAI・AzureOpenAI・SecuAiGent）の埋め込み API。**Python 版だけ** `99`（Echo）は、HTTP なしの擬似ベクトル（文字 2-gram のハッシュ。同じ文章は同じベクトル）で、キーなしで動かせる
- 動かして理解する手順（Docker の `onprem/vector-db` を使う）と、チャット 1 回のログの読み方は [docs/issue-299/08_動作確認.md](../docs/issue-299/08_動作確認.md) と [waha-emulator/README.md](../waha-emulator/README.md)
- 実 DB の確認用テスト（通常は skip。`onprem/vector-db` と同じ構成の DB が必要）: `NAW_RETRIEVAL_REAL_DB=127.0.0.1:15432 uv run pytest generative-ai-core/tests/test_retrieval_real_postgres.py`

## Apache Tika の呼び方（移植元との違い）

入力ファイルのテキスト抽出で、移植元は Apache Tika を使う。Python からは Java のライブラリを直接呼べないため、呼び方が変わる（#482）。

- **Tika の入れ方**
  - 移植元（Java）: 依存ライブラリ（jar）としてアダプタに組み込む（`generative-ai-core/pom.xml` の `spring-ai-tika-document-reader`）
  - Python 版: Tika のサーバー（3.1.0 の jar）と JRE を、`waha-emulator` の Docker イメージに入れる。jar はビルドのときに取得し、固定した SHA-512 で検証する（実行時のダウンロードはしない）
- **動く場所**
  - 移植元: アダプタと同じプロセスの中（Waha! のプロセス）
  - Python 版: 同じコンテナの中の子プロセス。コンテナ（デプロイの単位）は増やさない
- **呼び方**
  - 移植元: Java のメソッド呼び出し（`AutoDetectParser#parse`）
  - Python 版: HTTP。`PUT http://127.0.0.1:9998/tika`（`Accept: text/plain`、`Content-Type` に判定済みの MIME、`Content-Disposition` にファイル名）
- **起動**
  - 移植元: アダプタの起動と一緒
  - Python 版: 初めて必要になったときに起動する（遅延起動）。すでに応答する Tika があれば、起動せずにそれを使う。子プロセスが落ちたら、次の呼び出しで起動し直す。エミュレーターの終了時に止める
- **設定**
  - 移植元: `TextCoreMediaProcessor#parseContext`（OCR なし・埋め込み画像は読み飛ばす）
  - Python 版: 環境変数 `TIKA_SERVER_JAR`（jar を起動）・`TIKA_URL`（既存のサーバーを使う）。どちらもなければ Tika を使わない（下の「Tika を使わないとき」）。`TIKA_HEAP` などは [waha-emulator の README](../waha-emulator/README.md#環境変数)
- **失敗**
  - 移植元: `RuntimeException`（すべて `PARSER_FAILURE`）
  - Python 版: core の `CoreMediaPreprocessingResult` の失敗。ファイルの問題は、未対応の形式（415）が `UNSUPPORTED_MIME`、解析できない文書（そのほかの 4xx）が `CORRUPT_FILE`。Tika 側の障害（起動できない・応答しない・5xx・設定が不正）は `PARSER_FAILURE`

**Tika を使う対象**は、移植元の `TextCoreMediaProcessor` と同じ。次を除くすべて。

- 画像
- `.pdf`・`.docx`・`.pptx`・`.xlsx`（それぞれ専用のプロセッサが読む）
- MIME が `application/octet-stream` のもの。移植元と同じく、どのプロセッサも受け持たず `UNSUPPORTED_MIME` になる

つまり、`.doc`・`.xls`・`.ppt`・RTF・HTML・EPUB・HWP などが Tika に渡る。

**入れるコンテナ**は `waha-emulator`（`waha-emulator/Dockerfile`）だけ。アダプタはこのコンテナのプロセスの中で動くため。

- `onprem/docker-compose.yml` も、同じ Dockerfile からビルドする
- `secuaigent-server-local` は、Waha! にファイルを渡すだけでテキスト抽出はしないため、入れない
- 本物の Waha! には入れない（移植元の Java 版アダプタが、すでに Tika を組み込んでいる）
- クラウド側の `server/` は、同じ方式で Tika を使っている（#469。`server/app/core/tika_client.py`、`server/Dockerfile`）。移植元の `server/` も `TikaService` で Tika を使っている

**Tika を使わないとき**（`TIKA_SERVER_JAR`・`TIKA_URL` がどちらもない。core 単体のテストなど）: `TextCoreMediaProcessor` は Tika を使わず、テキスト系の MIME だけを自前のデコード（HTML はタグを除く）で読む。旧形式の Office や RTF などは `UNSUPPORTED_MIME` になる。

**移植元との差**（Tika 3.1.0 の jar を実際に動かして確かめた）:

- **OCR**: 移植元は OCR をしない。Python 版は、Tika の設定ファイルで `TesseractOCRParser` を除外して同じにする（コンテナに `tesseract` は入れない）
- **埋め込み画像**: 移植元は、埋め込みの画像を読み飛ばす（`EmbeddedDocumentExtractor`）。Tika のサーバーの設定では再現できなかった。画像のパーサーを除外しても、本文に `[image: ]` と埋め込みのファイル名（`image1.png` など）が出る。画像の中の文字は出ない（OCR なし）
- **`embedding-adapter/tika-config.xml`**: 移植元の中で、この設定ファイルを読み込む箇所が見つからなかったため、再現しない
- **失敗のコード**: 上のとおり、ファイルの問題を `UNSUPPORTED_MIME`・`CORRUPT_FILE` に分ける（移植元はすべて `PARSER_FAILURE`）
- **MIME の判定**
  - 移植元は Tika が判定する。Python 版は先頭のバイト・拡張子・中身で判定する（`detect_mime_type`）
  - RTF（先頭の `{\rtf`）と EPUB（ZIP の先頭＋拡張子 `.epub`）を判定に足した。足さないと、RTF は `text/plain`、EPUB は `application/zip` と判定され、Tika が RTF・EPUB として読まない
  - **Tika を使わない環境では、RTF・EPUB は `UNSUPPORTED_MIME` になる**（RTF は、これまでは制御語がそのまま本文に入っていた）
  - `.hwp` など、ほかの形式の判定は足していない
- **呼び出しの条件**: Tika に渡すときは、必ず判定済みの MIME を `Content-Type` に付ける（付けないと、200 で本文が空になることがある）

## 移植元にない拡張（Bedrock、#436）

移植元の Anthropic は「未対応」のスタブで、Bedrock のコードもない。Azure OpenAI の代わりに社内側から Bedrock を直接呼べるよう、Echo と同じ「Python 版だけのプロバイダ」として `Bedrock`（ID 97）を足した。

- 本体は `generative-ai-core/src/generative_ai_core/provider/clients/bedrock.py` の 1 ファイル。接続先ごとの違い（URL・認証のヘッダー）は、その中の `request_target` に集めてある
- OpenAI 系と同じ作りで、RAG のプロンプト・回答の解析・検証は `openai_compatible.py` の共通の関数を使う
- 既存のファイルに足したのは、`model.py`・`factory.py`・`vendor.py` の数行だけ。足した行には `bedrock-ext` の目印がある
- **未対応（スコープ外）**: 通常 chat の tools、ストリーミング

### 埋め込み（学習・検索のベクトル化）の Bedrock（#439）

Claude には埋め込みモデルがないため、回答の生成とは別に、Bedrock の Titan の埋め込みを呼ぶ実行器を足した。これも Python 版だけの拡張（ID は同じ `97`）。

- 本体は `generative-ai-core/src/generative_ai_core/embedding/bedrock.py` の 1 ファイル。学習用（埋め込みアダプタ）と質問用（検索アダプタ）の両方がこれを使う。接続先ごとの違い（URL・認証）は `request_target` に集めてある
- **接続先が回答の生成と別。** 回答の生成は Bedrock Mantle（`https://bedrock-mantle.<リージョン>.api.aws/anthropic`）だが、Mantle には埋め込みの入口がない。埋め込みは Bedrock Runtime の InvokeModel を呼ぶ。Bedrock API キーは同じものを使える
  - `URL` は `https://bedrock-runtime.<リージョン>.amazonaws.com`
  - `MODEL_NAME` は `amazon.titan-embed-text-v1`
- **次元数は 1536 で固定**（ベクトル DB のテーブルの `vector(1536)`）
  - Titan G1（V1）は 1536 次元で合う
  - **Titan V2（`amazon.titan-embed-text-v2:0`）は 1024・512・256 次元で合わず、使えない。** 返ったベクトルが 1536 次元でなければ、保存・検索の前に `DIMENSION_MISMATCH` で失敗にする。V2 を使うには、テーブルの次元数を設定にする別の変更が要る
- Titan G1 は英語に最適化されており、日本語の社内文書の検索の質は低い可能性がある
- 既存のファイルに足したのは、次の数行だけ（`bedrock-ext` の目印つき）
  - `embedding/factory.py`・`retrieval/query_embedding.py`
  - 埋め込みアダプタの `constants.py` と `service/embedding.py`
  - 検索アダプタの `constants.py`

### 消す手順

移植元が Bedrock に対応したときも、まずこれで外す。

1. `clients/bedrock.py` と `generative-ai-core/tests/test_bedrock_transport.py` を削除する
2. `embedding/bedrock.py` と `tests/test_bedrock_embedding.py` を削除する（埋め込みの拡張の分）
3. `grep -rn "bedrock-ext" generative-ai-adapter/ waha-emulator/ onprem/ .gitignore` で見つかった行を削除する（`generative-ai-adapter/` だけでも全部見つかる）。テストの関数（`bedrock-ext` のコメントを含むもの）は、関数ごと削除する
4. この節と、「プロバイダ」の `97` Bedrock の行、`onprem/` の Bedrock の設定（`config/`・README の節）を削除する
5. 移植元の実装に置き換えるなら、それを移植し、`factory.py` の分岐をそちらに向ける。ワークフロー定義は `VENDOR` の値を変えるだけで済む

手順を実行して元の状態に戻ることは、実際に取り除いて既存のテストが全件通ることで確かめた（`docs/issue-436/08_動作確認.md`）。
