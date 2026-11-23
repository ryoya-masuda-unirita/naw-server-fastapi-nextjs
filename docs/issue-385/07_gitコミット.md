# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント（00〜07）を作成 | `docs/issue-385/` |
| 2 | RDS の暗号化・バックアップ・バージョン・パラメータグループを揃える | `secuaigent-infra/modules/rds/` |
| 3 | ElastiCache のバージョン・暗号化・ポートを揃える | `secuaigent-infra/modules/elasticache/` |
| 4 | ECR にライフサイクルポリシーを足す | `secuaigent-infra/modules/ecr/` |
| 5 | README にデータストアの設定を書く | `secuaigent-infra/README.md` |
| 6 | 動作確認と code-review の結果を記録 | `docs/issue-385/` |

## 各コミットメッセージ案

```
#385 issue-385 設計ドキュメントを作成する
    - 00〜07 を作成

#385 issue-385 RDS の暗号化・バックアップ・バージョン・パラメータグループを揃える
    - PostgreSQL 18、暗号化、保持 7 日、自動マイナー更新、パラメータグループを足す

#385 issue-385 ElastiCache のバージョン・暗号化・ポートを揃える
    - Redis 7.1、保存時の暗号化、6379、フェイルオーバー無効を明示する

#385 issue-385 ECR にタグなしイメージを 30 日で削除するルールを足す

#385 issue-385 README にデータストアの設定を書く

#385 issue-385 動作確認と code-review の結果を記録する
```
