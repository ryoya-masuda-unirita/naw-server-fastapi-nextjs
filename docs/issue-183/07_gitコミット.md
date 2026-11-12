# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | ドキュメント（00〜07）を作成 | `docs/issue-183/00_チケット内容.md`〜`07_gitコミット.md` |
| 2 | メッセージ送信 API の SSE を移植元と同じ形式に変更 | `backend/app/services/message_service.py`, `backend/tests/unit/test_message_service.py`, `backend/tests/integration/test_messages.py` |
| 3 | 動作確認結果を記録 | `docs/issue-183/06_タスクリスト.md`, `docs/issue-183/08_動作確認.md` |
| 4 | code-review 結果を記録（指摘対応があれば併せて） | `docs/issue-183/code-review.md` ほか |

## 各コミットメッセージ案

```
#183 issue-183 原因調査結果と設計ドキュメントを作成
    - SSE形式が移植元と異なりフロントエンドが例外となりスナップショットへ戻ることが原因と切り分け
    - 00_チケット内容.md〜07_gitコミット.mdを作成
```

```
#183 issue-183 メッセージ送信APIのSSEを移植元と同じ形式に変更
    - イベント名の行をやめ、data行のJSONにtypeを含める
    - 最後のイベントをmessage_content(dataにメッセージ内容)にする
    - テストのイベント検証を新形式に置き換え、編集・再送信シナリオのテストを追加
```

```
#183 issue-183 動作確認結果を記録
    - 08_動作確認.mdにpytest結果を記録
```
