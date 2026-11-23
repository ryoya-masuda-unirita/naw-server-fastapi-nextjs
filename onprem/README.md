# onprem

顧客の社内（オンプレ）側の環境を Docker でまとめて立ち上げる（Issue #301）。ローカル検証用で、`.env` がなくても動く（既定値を変えるときだけ `.env.example` を `.env` にコピーする）。

## 起動・停止

```bash
cd onprem
docker compose up -d --build   # 初回はベクトルDB のビルド（Apache AGE のコンパイル）に数分かかる
docker compose ps              # すべて healthy になれば起動完了
docker compose down            # 停止（データも消すなら down -v）
```

## 立ち上がるもの

| サービス | ホストのポート | 内容 |
|---|---|---|
| server-local | 18090 | 社内の SECURE の窓口（`secuaigent-server-local/`）。認証キーは `onprem-local-key` |
| waha-emulator | 18091 | Waha!（とアダプタ）の代わり（`waha-emulator/`）。LLM は既定で echo |
| vector-db | 15432 | アダプタが使うベクトルDB（pgvector + PGroonga + Apache AGE）。DB・ユーザー `onprem_vector`、パスワード `onprem_vector_password` |
| `file-server/` | - | 顧客のファイルサーバーの代わり（サンプル文書）。エミュレーターの `/mnt/file-server` に読み取り専用で見える（ベクトルDB とともに、アダプタの取り込み後に使う） |

server-local と エミュレーターの接続・ストリームファイルの共有は設定済み。

```bash
curl -N -H "X-SERVER-AUTH-KEY: onprem-local-key" \
  -F 'textData={"assistantId":"onprem-chat","messageId":"m-1","userInput":"こんにちは"};type=application/json' \
  http://localhost:18090/api/messages/content
```

## クラウド側とつなぐ

1. ルートの compose（backend は 8001）を起動し、マイグレーションと seed を流す

   ```bash
   docker compose up -d                      # リポジトリのルートで
   docker exec naw-fastapi-backend uv run alembic upgrade head
   docker exec -i naw-fastapi-postgres psql -U root -d postgres < server/seed.sql
   docker exec -i naw-fastapi-postgres psql -U root -d postgres < onprem/cloud-seed.sql
   ```

2. `cloud-seed.sql` で、`test-tenant` に SECURE アシスタント「社内アシスタント（オンプレ）」と LOCAL_SERVER エンドポイント（URL `http://localhost:18090/`、API キー `onprem-local-key`）が登録される。ブラウザはこの URL の server-local に直接質問を送る（`.env` で認証キーを変えたら `cloud-seed.sql` の `api_key` も同じ値にする）
3. server-local はライブラリのスタブ作成で `http://host.docker.internal:8001`（ルートの compose の backend）を呼ぶ。backend を別のポートで動かすときは `.env` の `NAW_BASE_URL` を変える

## Bedrock で動かす（Azure OpenAI の代わり）

waha-emulator の LLM を、AWS Bedrock（Claude）にする。社内側（waha-emulator のアダプタ）から Bedrock を直接呼ぶので、質問はクラウドの server を通らない。

1. Bedrock の API key（Bearer 方式）を用意する。Claude のモデルアクセスが有効なリージョンのもの
2. ワークフロー定義を作る（接続先のリージョン・モデル名は書き換えてよい）

   ```bash
   cd onprem
   cp config/workflows.bedrock.example.json config/workflows.json
   ```

3. `.env` に次を書く（`cp .env.example .env` してコメントを外す）

   ```
   WAHA_WORKFLOWS_FILE=/app/onprem-config/workflows.json
   BEDROCK_API_KEY=<Bedrock API key>
   ```

4. 起動し直して、上の curl で質問する

   ```bash
   docker compose up -d --build
   ```

- `config/workflows.json` の `default` は、`workflows.json` に書いていないすべてのサービス ID（`onprem-chat` を含む）に使われる。`.gitignore` 済み（キーは `${BEDROCK_API_KEY}` で環境変数から渡す）
- モデル名は、Bedrock で使えるモデル ID（例: `anthropic.claude-haiku-4-5`）。違うと HTTP 400 の失敗になる
- 回答の生成と埋め込みで、`URL` の**ホストが違う**。回答の生成は Bedrock Mantle（`https://bedrock-mantle.<リージョン>.api.aws/anthropic`）、埋め込みは Bedrock Runtime（`https://bedrock-runtime.<リージョン>.amazonaws.com`）。API キーは同じものを使える
- 例（`config/workflows.bedrock.example.json`）には、回答の生成（`default`）に加えて、RAG（`bedrock-rag`。検索 → 回答）と、学習・同期・削除（`kb-learn`・`kb-sync`・`kb-delete`）が入っている。埋め込みのモデルは `amazon.titan-embed-text-v1`（1536 次元）。**Titan V2 は次元数が合わず使えない**。Titan G1 は英語向けで、日本語の検索の質は低い可能性がある
- **この例は、本物の Bedrock では、まだ確認していない**（`docs/issue-439/08_動作確認.md` に確認の手順がある）
- 埋め込みは、チャンクごとに 1 回ずつ呼ぶ。Bedrock は 1 分あたりの回数で制限するため、大きな文書の学習で 429 が出ることがある（自動のリトライはしない。時間をおいて学習し直す）
- IAM に `bedrock:InvokeModel` が要り、Bedrock のコンソールでモデル（Titan）の利用を有効にしておく。Bedrock API キーで呼ぶ場合は、`bedrock:CallWithBearerToken` も要る（後者は AWS の第三者の案内で、公式での確認は未了）
### 学習先フォルダごとに検索の対象を分ける

例の設定（`workflows.bedrock.example.json`）には、サービス ID の末尾の名前で保存先を分けるひな形（`kb-learn-*`・`kb-sync-*`・`kb-delete-*`・`bedrock-rag-*`）が入っている。フォルダごとに設定を書き足したり、再起動したりしなくてよい。

フォルダ「hr」の場合は、**4 つの名前の末尾を同じ名前（`hr`）にそろえる**。保存先は `docs_hr` になり、最初の学習で自動で作られる。

| 入れる場所（画面） | サービス ID |
|---|---|
| 学習先フォルダの「学習用サービスID」 | `kb-learn-hr` |
| 学習先フォルダの「取得用サービスID」 | `kb-sync-hr` |
| 学習先フォルダの「削除用サービスID」 | `kb-delete-hr` |
| アシスタント（接続サーバー: セキュア）の「サービスID」 | `bedrock-rag-hr` |

- 別のフォルダ（例: `expense`）は、末尾を `expense` にする。保存先が分かれ、検索も混ざらない
- 画面では、フォルダとアシスタントの結びつきは見えない（移植元も同じ）。**末尾の名前のそろえ間違いは検知できない**（アシスタントが空の保存先を探して「分かりません」と答える）
- 名前は、英小文字・数字・`_` の 1〜40 文字。違うと HTTP 400 になる。**ハイフン `-`・大文字・ドットは使えない**（保存先のテーブル名になるため。例: `hr-dept` でなく `hr_dept`）
- 末尾を付けない `kb-learn` などは、従来どおり 1 つの保存先（`docs`）を使う

- Bedrock の部品は Python 版だけの独自の拡張で、後から消せる。手順は [generative-ai-adapter/README.md](../generative-ai-adapter/README.md) の「移植元にない拡張」
- 実機（本物の Bedrock）での確認は、`docs/issue-436/08_動作確認.md` に記録する
