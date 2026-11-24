# code-review 結果

`/code-review medium` を、`origin/develop...HEAD`（PR #489 の範囲）に対して実行した。コード・compose の正しさに関わる指摘はなく、🔵 提案が 5 件だった（`docs/` は対象外）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `waha-emulator/Dockerfile` | コメントが、削除した `waha-emulator/docker-compose.yml` を指している | 対応済み |
| 2 | 🔵 提案 | `onprem/docker-compose.yml` | `SOURCE_ALLOWED_DIR: /mnt/file-server` が固定で、`.env` から変えられない | 対応しない |
| 3 | 🔵 提案 | `onprem/docker-compose.yml`・`onprem/.env.example` | `WAHA_WORKFLOWS_FILE` に Bedrock の拡張の目印（`bedrock-ext`）が付いていて、拡張を外すと、今回書いた `echo-rag` の手順が動かなくなる | 対応済み |
| 4 | 🔵 提案 | `onprem/docker-compose.yml` | `../waha-emulator/config` のマウントが `onprem/` の外を指す | 対応しない |
| 5 | 🔵 提案 | `waha-emulator/.env.example` | ホスト実行専用になったが、Docker でも使うように読める | 対応済み |

## 詳細

### 1. Dockerfile のコメントが削除したファイルを指す（🔵 提案）→ 対応済み

「ビルドコンテキストはリポジトリのルート（waha-emulator/docker-compose.yml の build.context）」を、`onprem/docker-compose.yml` に直した。

### 2. `SOURCE_ALLOWED_DIR` が固定（🔵 提案）→ 対応しない

指摘のとおり固定だが、この値は、同じ compose の `./file-server:/mnt/file-server` のマウント先と対になっている。許可するディレクトリを変えるには、マウントも変える必要があり、compose を編集することになる。環境変数だけで変えられるようにしても、マウントが対応しないため、使われない設定が増えるだけになる。compose のコメントに「下の file-server のマウント先」と書いてある。

### 3. `WAHA_WORKFLOWS_FILE` の `bedrock-ext` の目印（🔵 提案）→ 対応済み

確認したところ事実だった。`generative-ai-adapter/README.md` の「消す手順」は、`bedrock-ext` の目印がある行を削除するため、Bedrock の拡張を外すと `WAHA_WORKFLOWS_FILE` の行まで消え、`/app/config/workflows.example.json` を指定する手順（今回 README に書いた）が動かなくなる。

- `onprem/docker-compose.yml`: `WAHA_WORKFLOWS_FILE` の行から目印を外し、Bedrock 以外でも使う設定だとコメントに書いた（`BEDROCK_API_KEY` と `./config` のマウントには、目印を残した）
- `onprem/.env.example`: `/app/config/workflows.example.json` の例を、目印なしで足した

### 4. `/app/config` のマウントが `onprem/` の外を指す（🔵 提案）→ 対応しない

`onprem/docker-compose.yml` は、すでに `build: ../secuaigent-server-local` と、ビルドコンテキスト `..`（リポジトリのルート）に依存している。`onprem/` だけを切り出しては動かないので、新しい制約を足したことにはならない。

### 5. `waha-emulator/.env.example`（🔵 提案）→ 対応済み

先頭に「ホストで動かすとき（uv run）用」と、Docker では `onprem/.env`（`onprem/.env.example`）を使うことを書いた。
