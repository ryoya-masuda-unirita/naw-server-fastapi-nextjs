# code-review 結果

`/code-review medium` を PR #407 に実行した結果。レビューは差分だけで判断し、周辺のコードは確認していない。各指摘は、実際のコードと動作確認で確かめた。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 致命的 | `training-data-api-normalize.ts` | backend の応答の `tenantEndpoints` に `type` が無いと、接続先の ID が常に取れず、ローカルの操作がすべて失敗する | 対応しない（確認済み。問題なし） |
| 2 | 🔴 致命的 | `local-training-api.ts` | クラウドの `apiClient` が、外部のホストへクラウドの認証情報を送る恐れがある | 対応しない（確認済み。問題なし） |
| 3 | 🔴 致命的 | `local-training-api-helper.ts` | 空文字の項目を送らないため、参照リンクや表示名を空にできない | 対応しない（移植元と同じ） |
| 4 | 🔵 提案 | `use-training-data-detail.ts` | 型ガードが `folder is TrainingDataApiItem` で、偽の側が `undefined` に絞られる | 対応済み |
| 5 | 🔵 提案 | `local-training-api-helper.ts` | ローカルのフォルダで、効かない絞り込み（更新者）が画面に残る | 対応しない（別の Issue） |
| 6 | 🔵 提案 | `use-training-data-detail.ts` | `loginIds` の取得と、`userId` がログイン ID か不明で、更新者名が解決されない恐れ | 対応しない（確認済み。問題なし） |
| 7 | 🔵 提案 | `seed-demo.sql` | server-local の CORS が無いと、ブラウザが 8090 への通信を止める | 対応しない（確認済み。問題なし） |

## 詳細

### 1. `tenantEndpoints` の `type`（🔴 致命的）→ 対応しない

backend の `TenantEndpointItemResponse` は、`id`・`tenantId`・`type`・`endpointName`・`endpoint` を返す。デモ環境の動作確認でも、ローカルのフォルダを開いたときに、接続先の取得（`/api/tenants/endpoints/local/{id}`）が呼ばれ、`server-local` に届いた。`type` が無ければこの ID は取れないため、取れていることが確認になる。`indexRowToApiItem` のテストも、`LOCAL_SERVER` の行の ID が取れること、クラウドのフォルダや `type` の無い行からは取れないことを確かめている。

### 2. 外部のホストへの認証情報（🔴 致命的）→ 対応しない

`apiClient` は、`Authorization` などのトークンのヘッダーを付けない。認証はクッキーで、`credentials: 'include'` でもクッキーは送り先のホストごとに決まるため、クラウドのクッキーがローカル用サーバーへ送られることはない。付けるのは `X-Tenant-ID` だけで、移植元の `authInterceptor` が絶対 URL にも付けるのと同じ（`server-local` が必須とするヘッダー）。テナント管理者が接続先に別のホストを設定しても、送られるのはテナント ID とローカル用サーバーの API キーだけで、クラウドの認証情報は含まれない。

### 3. 空文字の項目を送らない（🔴 致命的）→ 対応しない

移植元の `toFormData` も、`undefined` と空文字の項目を送らない。参照リンクを空にできないことも、移植元と同じ動作（移植元の既存の制約）。移植元に合わせる方針のため、ここでは変えない。変える場合は、移植元とローカル用サーバーの扱い（欠けた項目と空の項目）を確かめてから、別の Issue で扱う。

### 4. 型ガード（🔵 提案）→ 対応済み

`isLocalFolder` の型ガードを `folder is LocalFolder`（`TrainingDataApiItem & { type: 'LOCAL' }`）に直した。偽の側が `undefined` に絞られなくなる。フォルダが未取得のときにクラウドへ落ちる点は、操作が画面（取得済みのフォルダを持つ）からしか起こらないため、フックの引数は省略可のままにした。

### 5. 効かない絞り込み（🔵 提案）→ 対応しない

ローカル用サーバーは更新者の絞り込みを受け取らない。移植元は、同じ理由で NAW-1424 で更新者の絞り込みを画面から外した。こちらの画面側の対応は、この PR の範囲外（#372 は backend の `loginIds` だけ）。並べ替えは #392 で外した。更新者の絞り込みの削除は、別の Issue として起票する。

### 6. `loginIds` と `userId`（🔵 提案）→ 対応しない

`/api/auth` の `id` は `login_id`（`auth_service.py`）で、ローカルに送る `userId` はログイン ID になる。`GET /admin/users` は `loginIds` を受け取る（#372、マージ済み）。デモ環境の動作確認で、`admin` が「管理者」、`tanaka` が「田中 太郎」に解決され、見つからない `retired-user` はログイン ID のまま出た。画面テストでも確かめている。

### 7. CORS（🔵 提案）→ 対応しない

`secuaigent-server-local` は、`allow_origin_regex=".*"`・`allow_credentials=True`・すべてのメソッドとヘッダーを許可している。デモ環境の動作確認で、`localhost:15173` からの通信が通った。デモは手元の Docker で動かすもので、クラウドには置かない。
