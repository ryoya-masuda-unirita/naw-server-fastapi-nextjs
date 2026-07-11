# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント一式作成 | `docs/issue-101/*.md` |
| 2 | メッセージ再生成（messageContentId指定での既存回答上書き）対応の実装 | `backend/app/schemas/message.py`, `backend/app/repositories/message_content_repository.py`, `backend/app/services/message_service.py` |
| 3 | 再生成関連のテスト追加 | `backend/tests/unit/test_message_service.py`, `backend/tests/unit/test_message_schemas.py`, `backend/tests/integration/test_message_content_repository.py` |
| 4 | 動作確認結果の記録 | `docs/issue-101/08_動作確認.md` |

## 各コミットメッセージ案

```
#101 issue-101 00_チケット内容.md〜05_テスト詳細設計.mdを作成
    - メッセージ再生成(messageContentId指定)対応の要件定義・基本設計・詳細設計・テスト設計を作成
```

```
#101 issue-101 メッセージ再生成(messageContentIdによる既存回答上書き)対応を実装
    - MessageContentCreateRequestにmessageContentIdを追加し、messageId/messageContentIdいずれか必須のバリデーションを追加
    - MessageContentRepositoryにfind_by_id_and_tenant_id・update_answerを追加
    - stream_message_contentでmessageContentId指定時に既存MessageContentを解決し、永続化時にstatus/answer/context/referencePathsを上書き、questionは維持するよう変更
```

```
#101 issue-101 メッセージ再生成関連のテストを追加
    - 再生成時の対象解決・永続化・エラー時の回帰テストを追加
    - リクエストスキーマのバリデーションテストを追加
    - MessageContentRepositoryのテナントスコープ検索・上書き更新のリポジトリテストを追加
```
