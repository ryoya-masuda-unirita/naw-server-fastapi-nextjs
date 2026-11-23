# code-review 結果

`/code-review medium` を、ブランチ `feature/issue-388`（PR #420）に対して実行した結果。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🔴 重要 | `secuaigent-infra/modules/github-actions/main.tf` | インフラ用ロール（広い権限）が、どのブランチのワークフローからも引き受けられる（信頼条件の `sub` にブランチが含まれず、自動作成された Environment には制限がない）。旧ロールは `develop` に固定されていた | 対応済み（設計を変更: 既定では作らない） |
| 2 | 🔴 重要 | `.github/workflows/deploy-infra.yml` | 鶏と卵: インフラのデプロイが新しい Secret を要求するが、そのロールを作るのが、このワークフロー自身の `apply` | 対応済み（手順を明記。最初のロールは、ローカルで作る） |
| 3 | 🔵 提案 | `secuaigent-infra/modules/github-actions/main.tf` | `RegisterTaskDefinition`（リソースを限定できない）と `PassRole` の組で、任意のコンテナを、これらのロールの権限で動かせる | 対応済み（残るリスクとして README に明記） |
| 4 | 🔵 提案 | `secuaigent-infra/modules/ecs/outputs.tf` | 出力 `backend_task_family` が、どこからも使われていない（不要コードの削除のルール） | 対応済み |
| 5 | 🔵 提案 | `secuaigent-infra/modules/github-actions/main.tf` | 手書きの操作の一覧から、必要な操作が漏れていて、最初の実デプロイが失敗するおそれ | 一部対応（`s3:AbortMultipartUpload` を追加。確認方法を明記） |

## 詳細

### 1. インフラ用ロールの信頼条件にブランチがない（🔴 重要）→ 対応済み

指摘のとおり、私の設計の弱点だった。Environment を使うジョブの `sub` は `repo:<リポジトリ>:environment:infra` で、ブランチを含まない。ブランチの制限は、Environment 側の設定（対象ブランチ・承認者）に頼る設計だったが、自動作成された Environment には、その制限が付かない。つまり、Environment を保護するまで、**旧ロールより弱くなる**（旧ロールは、信頼条件で `develop` に固定されていた）。

AWS の信頼条件で、ワークフローのパスやブランチを追加で固定できる条件（`job_workflow_ref` など）が使えるかは、調べても確認できなかった。確認できない機能には頼らない。

そこで、設計を変えた。**インフラ用ロールを、既定では作らない**（変数 `enable_github_actions_infra_role`、既定 false。4 つのリソースに `count` を付けた）。ロールがなければ、引き受けられない。有効にする手順を、README の必須の順序にした: (1) Environment `infra` に承認者と対象ブランチ（`develop`）を設定する、(2) 管理者権限でローカルから `enable_github_actions_infra_role = true` で `apply` する、(3) Secret を登録する。`plan` で、既定は 74（基準 76 から、旧ロールの広い管理ポリシー 2 つが減るだけ）、有効は 78（インフラ用の 4 つが増えるだけ）であることを確認した。

### 2. 最初のロールを、CI では作れない（🔴 重要）→ 対応済み

指摘のとおり。インフラ用ロールを使うワークフローが、そのロールを作ることはできない。上の 1 の設計で、最初の有効化は、必ずローカルで行う手順になり、README に明記した。Secret が未登録のときのエラーメッセージにも、既定ではロールが作られないこと、有効にする手順への案内を入れた。

### 3. `RegisterTaskDefinition` と `PassRole` の組（🔵 提案）→ 対応済み

指摘のとおり。タスク定義の登録は、AWS の仕様上、リソースを限定できない。`PassRole` を実行ロール・タスクロールに許可しているため、`develop` で実行されるコードは、任意のコンテナで、これらのロール（実行ロールは、Secrets Manager のシークレットを読める）の権限を使える。CI がタスク定義を登録してデプロイする仕組みでは、避けられず、移植元も同じ。README の「残るリスク」に、そのことと、`develop` に入るコードのレビューが境界を守っていることを書いた。

### 4. 使われていない出力（🔵 提案）→ 対応済み

`backend_task_family` を削除した。

### 5. 操作の漏れの可能性（🔵 提案）→ 一部対応

`aws s3 sync` の大きいファイルの失敗時に、断片を片づける `s3:AbortMultipartUpload` を足した。ECR のプッシュは、AWS のドキュメントの最小の組（認証、レイヤーの確認・アップロード、`PutImage`）にしてあるが、`docker buildx` での実プッシュは未確認。シミュレーターは権限の判定だけで、実行して初めて分かる操作の漏れは、検出できない。README に、最初の実デプロイで `AccessDenied` が出たら、CloudTrail で拒否された操作を確認して足すことを書いた。指摘の「旧ロールを、成功するまで残す」案は、旧ロールが、まさに広い権限の問題そのものなので、採らない。
