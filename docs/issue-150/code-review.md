# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `backend/Dockerfile.dev`, `frontend-angular/Dockerfile.dev` | `.dockerignore`が無く、ビルドコンテキストに`.venv`/`node_modules`等の不要なファイルが含まれてしまう | 対応済み |

## 詳細

### 1. `.dockerignore`未整備によるビルドコンテキスト肥大化（🔵 提案）→ 対応済み

`backend/`・`frontend-angular/`どちらにも`.dockerignore`が無く、Dockerfile自体が`.venv`・
`node_modules`をCOPYしていなくても、`docker build`はディレクトリ全体をビルドコンテキストと
してDockerデーモンに送信する。ホストに`.venv`（多数のパッケージを含む）や`node_modules`・
`.angular`キャッシュが存在する状態でビルドすると、無駄に時間がかかる。

`backend/.dockerignore`・`frontend-angular/.dockerignore`を新規作成し、`.venv`・
`node_modules`・`.angular`・`.git`等を除外するようにした。`.dockerignore`追加後も
`docker compose build`が問題なく成功することを確認した。
