# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `backend/seed-demo.sql` | クレジットの利用履歴が、月初の数時間に流すと前月の日付になり「今月の利用履歴」が空になる | 対応済み |
| 2 | 🟡 注意 | `backend/seed-demo.sql` | 追加ユーザーのパスワード履歴を ID の文字列の前方一致で選んでいる | 対応済み |
| 3 | 🔵 提案 | `docker-compose.demo.yml`・`frontend/Dockerfile.dev.dockerignore` | `frontend/.env`（`VITE_API_URL=http://localhost:8000`）がイメージに入り、compose の値と食い違う | 対応済み |
| 4 | 🔵 提案 | `backend/seed-demo.sql` | チャット履歴の更新日時に、流した時刻の数秒先を使っている | 対応しない |
| 5 | 🔵 提案 | `docker-compose.demo.yml` | frontend はソースをイメージに焼き込み、HMR が働かない | 対応しない |
| 6 | 🔵 提案 | `docker-compose.demo.yml` | `up -d` のたびに `migrate`・`seed` が走る。`seed.sql` に冪等でない INSERT があると失敗する、という指摘 | 対応しない（事実と異なる） |
| 7 | 🔵 提案 | `docker-compose.demo.yml` | localstack の初期化スクリプトの実行権限を compose で保証していない | 対応しない |

🔴 致命的はなし。

## 詳細

### 1. クレジットの利用履歴が月をまたぐ（🟡 注意）→ 対応済み

`created_at` を `now() - interval 'N minutes'`（最大 225 分前）にしていたため、毎月 1 日の 0 時台に流すと前月の日付に入り、ワークスペース画面の「今月の利用履歴」に出なかった。`greatest(now() - interval 'N minutes', date_trunc('month', now()) + interval 'K minutes')` にして、月初より前にならないようにした。

月をまたいで使い続けた場合は、`seed.sql` の契約開始日（当月 1 日固定）が古いままになるので、`down -v` で作り直す（README の「デモデータを入れ直す」）。

### 2. パスワード履歴の選び方（🟡 注意）→ 対応済み

`u.id::text LIKE '00000000-0000-4000-8000-0000000002%'` だと、`seed.sql` に同じ形式の ID のユーザーが後から増えたとき、そのユーザーにも `admin@1234` の履歴が付く。作った 10 名の `login_id` で選ぶ（`u.login_id IN (...)`）ようにした。

### 3. `frontend/.env` がイメージに入る（🔵 提案）→ 対応済み

今は compose の `VITE_API_URL`（プロセスの環境変数）が優先されるので動くが、`.env` の 8000 は backend のポートと食い違い、環境変数を外すとログインできなくなる。`frontend/Dockerfile.dev.dockerignore` に `.env` を足して、イメージに入らないようにした。再度、起動してログインできることを確認した。

### 4. 数秒先の更新日時（🔵 提案）→ 対応しない

チャット履歴を新しい順に並べたとき、デモのチャットを `seed.sql` の確認用ルームより上に出したい。確認用ルームは、`seed.sql` の中で `now()` で入るため、デモデータを数秒前にすると、確認用ルームの下に並ぶ（実際に最初の実装で確認した）。そのため、流した時刻の数秒先にずらしている。未来になるのは流した直後の数秒だけで、画面は分単位の表示なので見た目に影響しない。固定の過去時刻にすると、確認用ルームが先頭になり、デモデータが 2 ページ目以降に隠れる。

### 5. HMR が働かない（🔵 提案）→ 対応しない

このデモ環境は「画面を見る」ためのもので、`frontend/` を編集する用途は対象にしない（編集するなら `npm run dev` で動かす。README の「ローカル疎通確認」）。ソースを volume でマウントすると、`node_modules` を別 volume にする必要があり、構成が増える。

### 6. `up -d` のたびの `seed`（🔵 提案）→ 対応しない（事実と異なる）

「`seed.sql` に `ON CONFLICT` / `WHERE NOT EXISTS` のない INSERT がある」という指摘は、`AND NOT EXISTS` で守られている INSERT を数え漏らしたもの。実際に、起動済みの環境で `up -d` をもう一度実行し（`migrate`・`seed` が再実行され、終了コード 0）、`run --rm seed` も終了コード 0 で、`users`・`token_usages`・`password_histories` の件数が変わらないことを確認した。

### 7. localstack の初期化スクリプトの権限（🔵 提案）→ 対応しない

既存の `docker-compose.yml` と同じマウントで、同じ前提（macOS・Linux）で動いている。Windows のチェックアウトなどは、この環境の対象外。
