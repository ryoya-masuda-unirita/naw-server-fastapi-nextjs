# code-review 結果

`/code-review medium` を PR #410 に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔵 提案 | `secuaigent-infra/modules/rds/main.tf` | 暗号化とバージョンの明示で RDS が再作成になり、`skip_final_snapshot = true` のためデータが戻らない | 一部対応（README に明記。`prevent_destroy` は付けない） |
| 2 | 🔵 提案 | `secuaigent-infra/modules/rds/variables.tf` | `engine_version` の形式を検査しておらず、不正な値でパラメータグループのファミリが壊れる | 対応済み |
| 3 | 🔵 提案 | `secuaigent-infra/modules/elasticache/main.tf` | Redis のバージョンや暗号化を変えると、レプリケーショングループが再作成になる | 対応済み（変数の説明に明記） |
| 4 | 🔵 提案 | `secuaigent-infra/README.md` | 「pgvector を使っていない」という記述が、`embedding-adapter` の PGVector 対応と食い違う | 対応済み |

## 詳細

### 1. 既存環境でのデータ消失（🔵 提案）→ 一部対応

再作成になること自体は、設計の前提（新アカウントへの新規構築）で、README にも書いていた。指摘のとおり、`skip_final_snapshot = true` のため、**最終スナップショットが取られず、自動バックアップもインスタンスと一緒に消える**ことが、明確でなかった。README の「再作成になる変更」に、その点と、既存の環境に適用する場合は先に手動でスナップショットを取ることを書いた。`prevent_destroy` は、このリポジトリが `terraform destroy` で環境を片づける運用（費用を抑えるため）なので、付けない（付けると `destroy` が失敗する）。

### 2. `engine_version` の形式の検査（🔵 提案）→ 対応済み

`validation` を足した（`^[0-9]+(\.[0-9]+)?$`）。作業用コピーの `plan` で、`18.6` は通り（69 リソース）、`v18` と空文字列は、メッセージつきで失敗することを確認した。ファミリは、エンジンのバージョンの先頭の数字から決まる（`17.9` にすると `pg17`・`postgres17` に連動する、は前回確認済み）。

### 3. ElastiCache の再作成（🔵 提案）→ 対応済み

暗号化の 2 つの設定は、作成後に変えられない（変えると再作成）。バージョンの変更も、再作成になりうる。変数 `engine_version` の説明に、「変えるとレプリケーショングループの再作成になることがある（キャッシュの中身が消え、エンドポイントも変わる）。セッションを保持しているため、変更は計画して行うこと」を書いた。指摘の `ignore_changes = [engine_version]` は、バージョンの変更が反映されなくなるため、入れない。

### 4. pgvector の記述（🔵 提案）→ 対応済み

指摘が正しい。`generative-ai-adapter/embedding-adapter` は、ベクトル DB の種類として「PostgreSQL(PGVector)」を扱える。私の記述（「Python のサーバーは使っていない」）は、範囲を限らず言い切っていた。README を、「`server/`（このRDSをアプリのDBとして使う側）は使っていない。`embedding-adapter` のベクトル DB の接続先は、アダプタの設定で指定される別の DB で、この RDS が自動的にその役を担うわけではない。この RDS をベクトル DB として使う場合は、事前に `CREATE EXTENSION vector` とアプリ用ロールの作成が要る」に直した。その場合の対応は、別の変更として扱う（起票は、必要になった時点で）。
