# code-review 結果

`/code-review`（low effort）を実行し、`infra/`配下のTerraformコード差分をレビューした。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `infra/acm.tf` | ACM検証レコードの`for_each`が`domain_name`キーだったため、ベース/ワイルドカード両ドメインが同一Route53レコード名を指す2つの独立リソースになっており、`terraform destroy`時に片方がNotFoundで失敗しうる | 対応済み |
| 2 | 🟡 注意 | `infra/ecs.tf` | ECS用ASGが`min=max=desired=1`固定で冗長性ゼロ。インスタンス入れ替え中は必ずECSタスクが0台になる時間帯が発生する | 対応しない |
| 3 | 🔵 提案 | `infra/security_groups.tf` | RDS/ElastiCacheのegressを`0.0.0.0/0`全許可にしているが、これらが属するprivateサブネットのルートテーブルにインターネットへのデフォルトルートが存在せず、実質到達不能で無効化されている設定 | 対応しない |
| 4 | 🔵 提案 | `infra/cloudfront.tf` | S3向け`default_cache_behavior`にTTL指定がなく、CloudFrontのデフォルトTTL（24時間）が適用される。S3へ再デプロイしても手動でinvalidationしない限り最大24時間古いフロントが配信され続ける | 対応しない |

## 詳細

### 1. ACM検証レコードのfor_eachキー起因の重複リソース（🟡 注意）→ 対応済み

`aws_acm_certificate.main`はベースドメインとワイルドカードドメイン（`*.secuaigent-ryoyamasuda.tech`）をカバーするため、`domain_validation_options`に2エントリを持つ。ACMの仕様上、両ドメインの検証用CNAMEは**同一レコード名・同一値**になるが、`for_each`のキーを`dvo.domain_name`にしていたため、Terraform上は同じRoute53レコードを指す**2つの独立したリソース**（`cert_validation["secuaigent-ryoyamasuda.tech"]`と`cert_validation["*.secuaigent-ryoyamasuda.tech"]`）が生成されていた。

`allow_overwrite = true`によりapply時の重複作成エラーは既にIssue対応中に解消済みだったが、`terraform destroy`時には両リソースが同じレコードの削除を試み、先に削除された方の後続がNotFoundで失敗しうる構造的な問題が残っていた。

`for_each`のキーを`dvo.resource_record_name`（検証レコード名）に変更し、`...`（ellipsis）で同一キーの値をリストにグルーピングしてリソースを1個に集約するよう修正した。`each.value`がリストになるため、`each.value[0].name`のように先頭要素を参照する形に変更している。分離したTerraform環境で`...`によるグルーピング挙動を実際に検証した上で適用した。ホストゾーンは既にdestroy済みのため、実環境でのapply/destroy確認は次回の動作確認時に行う。

### 2. ECS用ASGの冗長性ゼロ（🟡 注意）→ 対応しない

`aws_autoscaling_group.ecs`が`min_size = max_size = desired_capacity = 1`で固定されており、インスタンス入れ替え（AZ障害・ヘルスチェック失敗等）が発生すると、新インスタンスがクラスタに登録されるまでの数分間、ECSタスクを実行できるホストが0台になる。実際、本Issue対応中のデプロイ作業でもこの状態が複数回発生した。

dev/staging専用環境でコスト最優先という方針（`t4g.nano`採用、RDSデフォルト停止運用等）と一貫しており、冗長化（min=2等）は月額コストの倍増を伴う。可用性が必要になった場合に別途検討する。

### 3. RDS/ElastiCacheのegressルールが到達不能（🔵 提案）→ 対応しない

`aws_security_group_rule.rds_all_out`・`elasticache_all_out`は`0.0.0.0/0`全ポート許可だが、これらが配置されるprivateサブネットのルートテーブル（`aws_route_table.private`）にはインターネットへのデフォルトルートが存在しない（NATゲートウェイ・VPCエンドポイント未設置）。そのためSGレベルでは許可されていても実際には到達不能であり、設定として無効化されている。

セキュリティ上のリスクは顕在化しない（そもそも通信できない）が、将来privateサブネットにルートが追加された場合に意図せず広範な発信が許可される潜在的な穴ではある。`08_動作確認.md`に記載の通り、RDS/ElastiCacheのegressを絞る検証は今回コスト対効果の都合で見送った経緯があり、同方針を維持する。

### 4. CloudFrontのS3向けTTL未指定（🔵 提案）→ 対応しない

`default_cache_behavior`（S3オリジン向け）にTTL指定がなく、CloudFrontのデフォルトTTL（24時間）が適用される。S3へフロントエンドを再デプロイしても、`create-invalidation`を実行しない限り最大24時間古いコンテンツが配信され続ける。

TTLを0にする対応も検討したが、フロント配信という性質上キャッシュされること自体は妥当な設計であり、デプロイ手順（`infra/README.md`）に`aws cloudfront create-invalidation`を含めることで運用上カバーしている。Issue #161（CI/CDパイプライン）でinvalidationも自動化する予定のため、手動ミスによる古いコンテンツ配信のリスクは今後さらに下がる見込み。現状維持とする。
