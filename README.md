# SecuAiGent の FastAPI + React への移植

企業向け AI チャット管理 SaaS「SecuAiGent」（旧称 NAW）を、Spring Boot + Angular から **FastAPI（Python）+ React** へ移植するリポジトリ。移植元は GitLab のモノレポ `secuaigent`。

## まず動かす

```bash
docker compose up -d --build   # 初回は数分。DB・デモデータ・画面まで起動する
```

1. ブラウザで http://localhost:5173 を開く
2. テナント ID `test-tenant`、ユーザー ID `admin`、パスワード `admin@1234` でログインする
3. 止めるときは `docker compose down`（データも消すなら `down -v`）

見られる画面・困ったときは [docs/demo.md](./docs/demo.md)。

## 詳しくはここ

| やりたいこと | 見る場所 |
|---|---|
| デモ環境の画面一覧・困ったとき | [docs/demo.md](./docs/demo.md) |
| 画面・backend をホストで直接動かして開発する（ホットリロード） | [docs/local-dev.md](./docs/local-dev.md) |
| アシスタントの通信経路（SECURE は社内に直接送る）と、部品の担当 | [docs/architecture-routes.md](./docs/architecture-routes.md) |
| SECURE アシスタントを通しで動かす（社内側をまとめて起動） | [onprem/README.md](./onprem/README.md) |
| 移植元の結合テスト項目書どおりに動くか確かめる | [e2e-spec/README.md](./e2e-spec/README.md) |
| 画面を自動で巡回してバグの疑いを探す | [e2e-explorer/README.md](./e2e-explorer/README.md) |
| AWS のインフラ（Terraform）・デプロイ | [secuaigent-infra/README.md](./secuaigent-infra/README.md) |

コードの置き場所:

| ディレクトリ | 内容 |
|---|---|
| `server/` | FastAPI（クラウドの backend） |
| `client/` | React（Vite + React Router） |
| `secuaigent-server-local/` | 顧客の社内のサーバー（FastAPI + SQLite）。[README](./secuaigent-server-local/README.md) |
| `generative-ai-adapter/` | Waha! 向けの生成AI・埋め込み・検索アダプター。[README](./generative-ai-adapter/README.md) |
| `waha-emulator/` | Waha! の代わりのエミュレーター。[README](./waha-emulator/README.md) |
| `onprem/` | 社内側をまとめて起動する compose |

## Codex 運用

`Codex` 用のプロジェクト運用ルールはルートの [AGENTS.md](./AGENTS.md) を参照してください。
