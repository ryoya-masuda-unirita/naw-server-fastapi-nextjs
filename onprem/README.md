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
| server-local | 18090 | 社内の SECURE の窓口（`server-local/`）。認証キーは `onprem-local-key` |
| waha-emulator | 18091 | Waha!（とアダプタ）の代わり（`waha-emulator/`）。LLM は既定で echo |
| vector-db | 15432 | アダプタが使うベクトルDB（pgvector + PGroonga + Apache AGE）。DB・ユーザー `onprem_vector`、パスワード `onprem_vector_password` |
| `file-server/` | - | 顧客のファイルサーバーの代わり（サンプル文書）。エミュレーターの `/mnt/file-server` に読み取り専用で見える |

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
   docker exec -i naw-fastapi-postgres psql -U root -d postgres < backend/seed.sql
   docker exec -i naw-fastapi-postgres psql -U root -d postgres < onprem/cloud-seed.sql
   ```

2. `cloud-seed.sql` で、`test-tenant` に SECURE アシスタント「社内アシスタント（オンプレ）」と LOCAL_SERVER エンドポイント（URL `http://localhost:18090/`、API キー `onprem-local-key`）が登録される。ブラウザはこの URL の server-local に直接質問を送る
3. server-local はライブラリのスタブ作成で `http://host.docker.internal:8001`（ルートの compose の backend）を呼ぶ。backend を別のポートで動かすときは `.env` の `NAW_BASE_URL` を変える
