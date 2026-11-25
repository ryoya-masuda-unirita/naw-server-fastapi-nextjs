# デモ環境（画面を見る）

| 項目 | 値 |
|---|---|
| URL | http://localhost:5173 |
| テナント ID | `test-tenant` |
| ユーザー ID・パスワード | `admin` / `admin@1234`（管理者）。一般ユーザーは `tanaka` / `admin@1234` ほか（下記） |

```bash
docker compose up -d --build   # 起動（初回は数分。マイグレーションとデモデータの投入も自動）
docker compose down            # 停止（データは残る）。データも消すなら down -v
```

起動すると、管理者でログインして次の画面を見られる（デモデータは [server/seed-demo.sql](../server/seed-demo.sql)、ログイン用のテナント・ユーザーは [server/seed.sql](../server/seed.sql)）。

| 画面 | パス | 見られるもの |
|---|---|---|
| ユーザー | `/admin/users` | 営業・開発・管理部門の社員 10 名（`tanaka`・`sato`・`suzuki`・`takahashi`・`ito`・`watanabe`・`yamamoto`・`nakamura`・`kobayashi`・`kato`。パスワードは全員 `admin@1234`） |
| チーム | `/admin/groups` | 営業部・開発部・管理部・全社共通（所属ユーザー・アシスタント・テンプレート付き） |
| アシスタント | `/admin/assistants` | 社内ヘルプデスク（RAG）・議事録要約・営業メール作成・翻訳・コードレビュー・営業ナレッジ検索（SECURE） |
| テンプレート | `/admin/templates` | 議事録・営業メール・翻訳・コードレビュー・障害報告書・FAQ |
| ライブラリ | `/library` | 管理者が保存した資料 4 件（タグ付き） |
| 学習データ | `/admin/training-data` | クラウド・ローカルの学習先フォルダと、規程・事例のファイル |
| フィードバック | `/admin/feedback` | 回答の正確・不正確と満足度の評価、追加学習の設定 |
| チャット履歴 | `/admin/chat-history` | 社員のチャット 12 件（問い合わせ・議事録・メール作成など） |
| ワークスペース | `/admin/tenant` | プランとクレジットの利用状況・今月の利用履歴 |

**ローカルの学習先フォルダ（「営業ナレッジ（社内サーバー）」）を操作するには、`server-local` を手元で起動する。** ローカルのフォルダのファイルは、クラウドの API ではなく、フォルダの接続先（デモでは `http://localhost:8090`）の `server-local` へ画面から直接送る。起動していないと、このフォルダの一覧は開けずエラーになる。

```bash
cd secuaigent-server-local
cp .env.example .env     # SECURITY_SERVER_AUTH_KEY=demo-local-server-key に設定する（デモデータの接続先の API キーと同じ値）
mkdir -p data/stream-output
docker compose up -d --build   # 公開ポートは既定の 8090（詳細は secuaigent-server-local/README.md）
```

ファイルの追加・更新・同期は、`server-local` が Waha! を呼ぶため、Waha! がないと失敗する。Waha! の代わりには `waha-emulator/`（[waha-emulator/README.md](../waha-emulator/README.md)）を使う。

チャットの送信先（Azure OpenAI など）はダミーなので、画面からの新しい質問には答えが返らない。SECURE アシスタントのチャットは、`onprem/` をつなぐと試せる。

```bash
docker compose exec -T postgres psql -U root -d postgres < onprem/cloud-seed.sql   # SECURE アシスタントと接続先を登録
cd onprem && docker compose up -d --build                                                                      # 社内側を起動（詳細は onprem/README.md）
```

困ったとき:

- ポートが使われている: `.env` で `FRONTEND_PORT`・`BACKEND_PORT` を変える（`cp .env.example .env`。既定は画面 5173・backend 8001。`.env` がなくても既定値で動く）
- 起動の状態: `docker compose ps -a`（`migrate`・`seed` は終了済みで正常。`backend`・`frontend` が healthy になれば完了）
- 失敗したとき: `docker compose logs <サービス名>`。`migrate`・`seed` が失敗すると、backend・画面が起動しないため、まず `docker compose logs migrate seed` を見る
- デモデータを入れ直す: `down -v` のあと、もう一度 `up -d --build`
