# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント（00〜07）を作成 | `docs/issue-182/00_チケット内容.md`〜`07_gitコミット.md` |
| 2 | メッセージ送信 API を移植元と同じ multipart 受け取りに変更 | `backend/app/schemas/message.py`, `backend/app/schemas/attachment.py`, `backend/app/routers/messages.py`, `backend/tests/integration/test_messages.py`, `backend/tests/unit/test_message_schemas.py` |
| 3 | 動作確認結果を記録 | `docs/issue-182/06_タスクリスト.md`, `docs/issue-182/08_動作確認.md` |
| 4 | code-review 結果を記録（指摘対応があれば併せて） | `docs/issue-182/code-review.md` ほか |

## 各コミットメッセージ案

```
#182 issue-182 原因調査結果と設計ドキュメントを作成
    - 送信APIがmultipartを422で拒否し本文が保存されないことが原因と切り分け
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#182 issue-182 メッセージ送信APIを移植元と同じmultipart受け取りに変更
    - textDataパート(JSON)とattachmentFiles/historyAttachmentFilesファイルパートで受け取る
    - textDataのcreateLibrary/response_format/historyMessages[].typeを移植元の名前で受け取る
    - 既存の送信APIテストをmultipart送信に置き換え、再現シナリオのテストを追加
```

```
#182 issue-182 動作確認結果を記録
    - 08_動作確認.mdにpytest結果を記録
```
