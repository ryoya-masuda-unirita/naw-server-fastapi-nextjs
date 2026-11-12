# code-review 結果

PR #305 に `/code-review` を実行した結果。🔴 致命的の指摘はなかった。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `onprem/docker-compose.yml` | waha-emulator が、使っていない vector-db の healthy を待つ。vector-db のビルド・起動に失敗すると全体が起動しない | 対応済み |
| 2 | 🟡 注意 | `onprem/cloud-seed.sql` | LOCAL_SERVER の API キー・URL が固定値で、`.env` の `SERVER_LOCAL_AUTH_KEY` に追随しない | 対応済み（README に追記） |
| 3 | 🟡 注意 | `onprem/docker-compose.yml` | waha-emulator に `AZURE_OPENAI_API_VERSION`（と `EXECUTE_WAIT_FOR_COMPLETION`）を渡していない | 一部対応済み |
| 4 | 🔵 提案 | `onprem/docker-compose.yml` | 単体の compose を `extends` / `include` せず、サービス定義を手で複製している | 対応しない |
| 5 | 🔵 提案 | `onprem/docker-compose.yml` | `file-server/` はエミュレーターから見えるだけで、まだ何にも使われていない | 対応済み（README に追記） |
| 6 | 🔵 提案 | `onprem/vector-db/init/01-init.sql` | DB の既定の `search_path` が `ag_catalog` 先頭のため、修飾なしの `CREATE TABLE` が `ag_catalog` に作られる | 対応しない |
| 7 | 🔵 提案 | `onprem/vector-db/init/01-init.sql` | `ALTER DATABASE onprem_vector` と DB 名を固定で書いており、compose の `POSTGRES_DB` と二重管理 | 対応しない |
| 8 | 🔵 提案 | `onprem/vector-db/Dockerfile` | `groonga-apt-source-latest` と PGroonga の厳密な版の固定の組み合わせは、版が消えるとビルドできない | 対応しない |

## 詳細

### 1. vector-db への不要な依存（🟡 注意）→ 対応済み

エミュレーターは今はベクトルDB を使わないため、`depends_on: vector-db` を外した。vector-db のビルド（AGE のコンパイル・PGroonga の取得）に失敗しても、server-local とエミュレーターは起動し SECURE のチャットを確かめられる。アダプタを取り込む Issue で、必要なら依存を足す。修正後に空の状態から起動し直し、全サービスが healthy・チャットの回答が返ることを確かめた（08 の 10）。

### 2. seed の API キーが `.env` に追随しない（🟡 注意）→ 対応済み（README に追記）

seed は SQL ファイルで、compose の環境変数を読めない。既定値どおりに使う前提とし、README の「クラウド側とつなぐ」に「`.env` で認証キーを変えたら `cloud-seed.sql` の `api_key` も同じ値にする」と一言足した（`.env.example` にも同じ注意がある）。psql の変数で差し込む方式は、手順が長くなるため採らない。

### 3. エミュレーターの環境変数の不足（🟡 注意）→ 一部対応済み

`AZURE_OPENAI_API_VERSION` を compose（既定 `2024-10-21`、単体の compose と同じ）と `.env.example` に足した。`EXECUTE_WAIT_FOR_COMPLETION` は既定の `true` から変える理由がない（`false` にすると server-local の待ち時間内に終わらず失敗し得る）ため足さない。

### 4. 単体の compose の `extends` / `include`（🔵 提案）→ 対応しない

単体の compose は `container_name`（`naw-server-local` 等）・`image`（`naw-server-local:latest`）・ポート（8090/8091）・`user`・必須の環境変数（`?` 付き）・バインドマウント（事前の mkdir が必要）を持つ。`extends` するとこれらを引き継ぎ、単体の compose と衝突するうえ、`.env` なしで起動できなくなる。`ports` などは `!override`・`!reset` で消せるが、消す項目のほうが多く、かえって読みにくくなるため、必要な項目だけを書く。

### 5. `file-server/` が未使用（🔵 提案）→ 対応済み（README に追記）

Issue の要件（ファイルサーバーの代わりとサンプル文書を用意する）どおりで、使うのはアダプタの取り込み（#298〜#300）の後。README の表に「ベクトルDB とともに、アダプタの取り込み後に使う」と足した。

### 6. `search_path` が `ag_catalog` 先頭（🔵 提案）→ 対応しない

移植元の Waha! 手動検証環境・統合テスト用の初期化 SQL と同じ設定。アダプタは移植元に合わせて移植する（#298〜）ため、DB 側も移植元に揃える。テーブルの作り方はアダプタの移植の際に移植元のマイグレーションに従う。

### 7. 初期化 SQL の DB 名の固定（🔵 提案）→ 対応しない

`POSTGRES_DB` は compose に固定値で書いており、`.env` では変えられない。移植元の初期化 SQL も DB 名を固定で書いている。

### 8. PGroonga の版の固定（🔵 提案）→ 対応しない

移植元の検証用イメージと同じ版（`4.0.6-1`）に揃えるため、移植元と同じ書き方にしている。Groonga のリポジトリから版が消えたら、移植元に合わせて版を上げる。
