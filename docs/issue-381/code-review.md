# code-review 結果

`/code-review medium` を PR #389 に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `.github/workflows/deploy.yml` | `infra/**` と `backend/**`・`frontend/**` を同時に変更した PR をマージすると、インフラは適用されず、新しいコードが古いインフラの上にデプロイされる | 対応済み |
| 2 | 🔵 提案 | `.github/workflows/deploy.yml` | `backend`・`frontend` ジョブのコメントが、パスの判定で `infra` が動く旧仕様のまま | 対応済み |
| 3 | 🔵 提案 | `.github/workflows/deploy-infra.yml` | `tfstate_bucket_name` が必須になり、古い `terraform.tfvars` だと `plan` で値を聞かれる | 対応しない |
| 4 | 🔵 提案 | `infra/bootstrap/main.tf` | バケットにタグがない（削除前は `Name` と `Project` が付いていた） | 対応済み |
| 5 | 🔵 提案 | `infra/bootstrap/main.tf` | TLS を強制するバケットポリシーと ownership controls がない | 対応しない |
| 6 | 🔵 提案 | `infra/bootstrap/main.tf` | bootstrap のローカル state を失った場合の復旧手順が 1 行だけ | 対応済み |
| 7 | 🔵 提案 | `.github/workflows/deploy-infra.yml` | `TF_STATE_BUCKET` の空チェックだけでは、改行や空白の混入を検出できない | 対応済み |

## 詳細

### 1. 古いインフラの上に新しいコードがデプロイされうる（🟡 注意）→ 対応済み

自動適用を止めたことで、インフラの変更とアプリの変更を同じ PR に含めた場合に、適用の順序が保証されなくなる。インフラの自動適用は止める方針（#381）なので、止めたまま気づけるようにした。`deploy.yml` の `changes` ジョブに、push で `infra/**`（`infra/route53/**` を除く）に変更があるときだけ `::warning::` を出すステップを足した。`changes` ジョブの出力には戻していない（同じジョブ内で使うため）。README にも、インフラを先に手動で反映する旨を書いた。

### 2. ジョブのコメントが古い（🔵 提案）→ 対応済み

`backend` は「`infra` は push では常にスキップされ、`skipped` を成功と同様に扱う」、`frontend` は「手動実行でインフラも同時に動かす場合に待つ」という説明に直した。

### 3. `tfstate_bucket_name` が必須になる（🔵 提案）→ 対応しない

`infra/README.md` の手順 3 と `terraform.tfvars.example` に、`tfstate_bucket_name` を入れることを書いてある。既定値を持たせると、別アカウントのバケット名を誤って使う余地が残る。CI は `TF_VAR_tfstate_bucket_name` で渡している。ローカルで古い `tfvars` を使う場合に聞かれるのは意図した動作。

### 4. バケットのタグ（🔵 提案）→ 対応済み

`Name` と `Project` を、削除した `tfstate_backend.tf` と同じ形で付けた。`default_tags` は #383 で本体と合わせて導入する。

### 5. TLS 強制ポリシーと ownership controls（🔵 提案）→ 対応しない

移植元の bootstrap にもなく、今回の目的（state の分離と自動適用の停止）の外。新規に作るバケットの ownership は、既定で BucketOwnerEnforced になる。TLS の強制は、セキュリティ強化として別 Issue で扱うのが適切。

### 6. ローカル state を失った場合の復旧手順（🔵 提案）→ 対応済み

バケットが既にある状態で `apply` すると `BucketAlreadyOwnedByYou` で失敗する点と、4 リソース分の `terraform import` のコマンドを README に書いた。bootstrap 自体をリモート backend に移す案は、「backend のためのバケット」を作る構成の鶏卵問題に戻るので採らない。

### 7. バケット名の形式チェック（🔵 提案）→ 対応済み

空チェックに加えて、`^[a-z0-9.-]{3,63}$` に合うかを検査するようにした。正しい名前、空、空白入り、末尾に改行、短すぎる値を bash で試し、正しい名前だけが通ることを確認した。
