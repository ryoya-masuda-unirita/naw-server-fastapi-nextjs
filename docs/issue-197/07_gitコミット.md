# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式（00〜06） | `docs/issue-197/` |
| 2 | Dockerイメージにマイグレーション定義を含める | `backend/Dockerfile` |
| 3 | マイグレーション用ECSタスク定義とIAM権限を追加 | `infra/ecs.tf`, `infra/github_oidc.tf` |
| 4 | デプロイパイプラインにマイグレーション実行ステップを追加 | `.github/workflows/deploy-backend.yml` |
| 5 | seed投入スクリプトを追加し、READMEを更新 | `infra/scripts/seed_via_bastion.sh`, `infra/README.md` |
| 6 | 動作確認結果の記録 | `docs/issue-197/08_動作確認.md` |

## 各コミットメッセージ案

```
#197 issue-197 CI/CD整備の設計ドキュメントを作成
    - 00〜06の各ドキュメントを作成
```

```
#197 issue-197 バックエンドDockerイメージにマイグレーション定義を含める
    - alembic.iniとalembic/をイメージにCOPYする
```

```
#197 issue-197 マイグレーション用ECSタスク定義とIAM権限を追加
    - ポートマッピング無し・コマンド固定・小メモリのbackend_migrateタスク定義を追加
    - github_actionsロールにecs:RunTask/ecs:DescribeTasksを追加
```

```
#197 issue-197 デプロイパイプラインにDBマイグレーション自動実行を組み込む
    - deploy-backend.ymlにマイグレーションタスクの登録・実行・完了待ち・exitCode検査を追加
    - マイグレーション失敗時はbackendサービス更新を実行しないようにする
```

```
#197 issue-197 bastion経由のseed投入をスクリプト化する
    - infra/scripts/seed_via_bastion.shを追加
    - infra/README.mdの手動手順をスクリプト実行手順に置き換える
```

```
#197 issue-197 動作確認結果を記録
    - 08_動作確認.mdに実施結果を記録
```
