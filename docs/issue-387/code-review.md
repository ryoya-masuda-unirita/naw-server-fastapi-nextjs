# code-review 結果

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `secuaigent-infra/modules/frontend/main.tf` | `/api/*` の転送ヘッダが限定リストなので、リスト外のヘッダ（`Last-Event-ID` など）が落ちる | 対応しない |
| 2 | 🔵 提案 | `secuaigent-infra/modules/frontend/main.tf` | バージョニングを有効にしたが、旧版の期限切れルールがなく、デプロイのたびに旧版が溜まる | 対応しない |
| 3 | 🟡 注意 | `secuaigent-infra/modules/frontend/main.tf` | 5xx の `custom_error_response` は全体に効くので、ALB の 5xx も毎回オリジンへ取りに行く。コメントは S3 の 503 しか説明していない | 対応済み（コメントを補足） |
| 4 | 🟡 注意 | `secuaigent-infra/modules/frontend/main.tf` | `/backend/auth/*` に圧縮を付けたが、全ヘッダ（`Accept-Encoding` を含む）を転送していて、挙動を確認していない。小さい JSON で効果も薄い | 対応済み（圧縮を外した） |
| 5 | 🔵 提案 | `docs/issue-387/06_タスクリスト.md` ほか | docs が PR の最終状態と合っていない | 対応済み |

## 詳細

### 1. 転送ヘッダの限定リスト（🟡 注意）→ 対応しない

リスト外のヘッダが必要になる場面があるかを、client と server のコードで調べた。

- client は `EventSource` を使っておらず、`Last-Event-ID` はどこにもない。チャットの SSE は、`fetch` の POST で受けている
- client が cloud の API に付けるヘッダは `Content-Type`・`X-Tenant-ID`・`Accept` だけ（`api-client.ts` の `buildHeaders` と、`message-content-stream.ts`）。`X-Server-Auth-Key` は server-local（オンプレ）へ送るもので、CloudFront を通らない
- server が読むヘッダは、`X-Tenant-ID`（必須）・`Authorization`（`HTTPBearer`）・Cookie（`session_id`）だけ。Cookie は、ヘッダとは別の設定（`cookies.forward = "all"`）で転送している
- 必要なヘッダは、すべてリストに入っている。将来、新しいヘッダを使うときは、このリストに足す必要がある（コメントに理由を書いた）

「X-Tenant-ID を落とすと全リクエストが 400 になる」点は、設計の段階で気づいて対応済み（`Host` を外して `X-Tenant-ID` を足した）。

### 2. 旧版の期限切れルール（🔵 提案）→ 対応しない

移植元にもないルールで、Issue のスコープ外。デプロイで置き換わるのはフロントエンドのバンドルで、1回あたりの容量は小さく、当面は費用が問題にならない。必要になったら、`aws_s3_bucket_lifecycle_configuration` を別 Issue で足す。PR の「注意」に書いてある。

### 3. 5xx の設定が ALB にも効く（🟡 注意）→ 対応済み

指摘のとおり、この設定は全体に効く。意図どおり（移植元も同じ。障害から回復した後に、古い 5xx が返り続けるのを避けられる）なので、挙動は変えず、コメントに「ALB の 5xx も毎回オリジンへ取りに行く」ことと、移植元と同じであることを書いた。

### 4. `/backend/auth/*` の圧縮（🟡 注意）→ 対応済み

認証 API の応答は小さい JSON で、圧縮の効果が薄い（CloudFront は小さい応答を圧縮しない）。全ヘッダ転送との組み合わせの挙動も確認していないので、`compress` を外した。圧縮は、画面（S3）と `/api/*` の2か所。plan で、`compress = true` が2か所、`false` が1か所になったことを確認した。docs（01・02・03・08）も合わせて直した。

### 5. docs の更新（🔵 提案）→ 対応済み

タスクリストのチェックと、圧縮の対象を2か所にする変更を、docs に反映した。実環境の plan が未確認である点は、`08_動作確認.md` と PR 本文の「未確認」に書いてあり、変更していない。
