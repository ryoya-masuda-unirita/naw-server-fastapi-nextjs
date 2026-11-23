# code-review 結果

`/code-review medium` を PR #393 に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `.github/workflows/deploy-infra.yml` | `Terraform Format Check` が `-recursive` でなく、作業ディレクトリ移動後は `modules/` 配下が検査されない | 対応済み |
| 2 | 🔵 提案 | `infra/environments/dev/main.tf` | state の key を変えたため、旧 key の state が孤立する | 対応済み |
| 3 | 🔵 提案 | `infra/modules/ecs/main.tf` ほか | 旧ファイルを結合した箇所に空行がなく、末尾の改行もない | 対応済み |
| 4 | 🔵 提案 | `infra/modules/ecs/main.tf` | ECS サービスの `depends_on` を外し、alb モジュールの出力に移したため、サービス側から依存が見えない | 対応しない |

## 詳細

### 1. `fmt -check` がモジュール配下を検査しない（🟡 注意）→ 対応済み

ほとんどの HCL が `modules/` に移ったのに、作業ディレクトリ（`infra/environments/dev`）の直下の 5 ファイルしか検査されなくなっていた。`terraform fmt -check -diff -recursive ../..` にして、`infra/` 全体を検査するようにした。ローカルで `terraform fmt -recursive -check` が通ることも確認した。

### 2. state の key の変更（🔵 提案）→ 対応済み

新アカウントへの新規構築が前提なので、`moved` ブロックや移行手順は入れない。ただし前提が README に書かれていなかったので、「この構成は新規構築が前提。旧構成の既存環境に適用すると、空の新 key に対して作成を試みて名前が衝突する。引き継ぐ場合は、先に state オブジェクトを新 key へコピーする」と、初回セットアップ手順の冒頭に書いた。

### 3. 結合部の空行と末尾の改行（🔵 提案）→ 対応済み

`cat >>` で結合した箇所で、`}` の直後に次のコメントやリソースが続いていた（7 ファイル）。`terraform fmt` は空行を直さないため、`fmt -check` は通っていた。トップレベルの `}` の直後に空行を入れ、末尾に改行を足した。リソースの比較（70 対 70、差分 64 行）は、空行を無視して比べるので変わらない。

### 4. `depends_on` がサービス側から見えない（🔵 提案）→ 対応しない

ECS サービスの位置には、依存がアルブのモジュールの出力 `target_group_arn` 経由であることを書いたコメントを残している。指摘の代案（`environments/dev` で ecs モジュール全体に `depends_on` を付ける）は、モジュール内のデータソース（AMI の SSM パラメータ）の読み取りを apply まで遅らせ、plan の見通しを悪くする。モジュールをまたぐ依存の書き方としては、出力に `depends_on` を付ける今の形のほうが、影響範囲が狭い。
