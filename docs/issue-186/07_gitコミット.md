# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式を作成 | `docs/issue-186/*` |
| 2 | LocalStack（S3/SQS）をローカル環境に追加 | `docker-compose.yml`, `docker-compose/localstack-init/*` |
| 3 | AWS設定とS3ストレージ実装を追加 | `app/core/config.py`, `app/core/file_storage.py`, `.env.example`, `pyproject.toml` |
| 4 | SQSキュー送受信の仕組みを追加し、ユーザーインポートを非同期構成に変更 | `app/services/user_import_queue_service.py`, `app/services/user_import_listener.py`, `app/services/user_import_service.py`, `app/main.py` |
| 5 | テストを非同期構成に合わせて追加・修正 | `tests/unit/test_file_storage.py`, `tests/unit/test_user_import_queue_service.py`, `tests/unit/test_user_import_listener.py`, `tests/integration/test_user_import.py` |
| 6 | 動作確認結果を記録 | `docs/issue-186/08_動作確認.md` |

## 各コミットメッセージ案

```
#186 issue-186 00_チケット内容.md〜07_gitコミット.mdを作成
    - S3/SQSローカル対応の要件定義・基本設計・詳細設計・テスト設計・タスクリストを整理

#186 issue-186 LocalStackをローカル環境に追加
    - docker-compose.ymlにlocalstackサービスを追加し、S3/SQSをローカルでエミュレート
    - 起動時にユーザーインポート用バケット・キューを自動作成する初期化スクリプトを追加

#186 issue-186 AWS設定とS3ストレージ実装を追加
    - AwsSettingsを追加しLocalStack向けのエンドポイント・認証情報を環境変数化
    - FileStorageの実装としてS3FileStorage（aioboto3使用）を追加しLocalFileStorageを削除

#186 issue-186 SQSキュー送受信を追加しユーザーインポートを非同期構成に変更
    - UserImportQueueService・UserImportListenerを新規追加
    - UserImportServiceをアップロード＋キュー送信のみ行う非同期フローに変更
    - app起動時にリスナーをバックグラウンドタスクとして起動するlifespanを追加

#186 issue-186 非同期構成に合わせてテストを追加・修正
    - S3ストレージ・キュー送信・キュー受信の単体テストを新規追加
    - 既存のユーザーインポート結合テストを非同期フロー向けに書き換え

#186 issue-186 08_動作確認.mdに動作確認結果を記載
    - docker compose up〜frontend-angular経由での一連の動作確認結果を記録
```
