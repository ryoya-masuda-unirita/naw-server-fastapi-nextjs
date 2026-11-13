# generative-ai-adapter

Waha!（ユニリタの ETL 製品）に組み込む生成AIアダプタの Python 移植（Issue #298）。移植元は `secuaigent/generative-ai-adapter/`（Java。`generative-ai-core`・`generative-ai-adapter`・`embedding-adapter`・`retrieval-adapter` の 4 プロジェクト）。

アダプタは**サーバーではなくライブラリ**。`waha-emulator/`（Waha! の代わりのサービス）のワークフローから import して、Waha! の呼び方（`set_property` → `connect` → `before_execute` → `write`）のまま呼ぶ。

- 移植元の構造・判断の根拠は [docs/issue-298](../docs/issue-298/)
- 実際の LLM には接続しない自動テストが付いている（HTTP はモック）

## 構成

uv のワークスペース（このディレクトリがルート）。移植元と同じ 4 つの分け方にし、いま移植したのは上 2 つ。

| ディレクトリ | パッケージ | 役割 | 状況 |
|---|---|---|---|
| `generative-ai-core/` | `generative_ai_core` | Waha! に依存しない共通 runtime。chat・RAG・画像説明、プロバイダ（OpenAI・Azure OpenAI・SecuAiGent など）、ネットワーク（プロキシ・SSL・タイムアウト）、ファイル前処理（テキスト・画像） | chat・provider・network・media（テキスト・画像）を移植 |
| `generative-ai-adapter/` | `generative_ai_adapter` | Waha! の生成AIアダプタ本体。通常チャット（出力モード 0・2）と RAG 回答（その他）を core に任せ、`RetrievalAnswer` の JSON を書く | 移植（ログ出力先・HTTP クライアントの互換部分・Office/PDF の薄い層を除く） |
| `embedding-adapter/` | — | 文書の分割、ベクトル保存・更新・削除 | 後続の Issue |
| `retrieval-adapter/` | — | ベクトル・ハイブリッド・Graph RAG の検索 | 後続の Issue |

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
uv run mypy generative-ai-core && uv run mypy generative-ai-adapter   # tests に同名の conftest.py があるため別々に実行する
```

- docstring は NumPy 形式（日本語。`Parameters`・`Returns`・`Raises`）。ruff の D ルール（numpy）を `pyproject.toml` で有効にしている
- テストは移植元の Java のテスト（`src/test`）のうち今回の範囲に当たるものを移したもの。各テストファイルの先頭に、どの Java のテストを移したかを書いている
- 実際の LLM には接続しない。OpenAI・Azure・SecuAiGent の HTTP は `respx` でモックする

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
