# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 00〜06ドキュメント作成 | `docs/issue-114/` |
| 2 | 閲覧系APIへの共有リンクアクセス制御反映（実装） | `backend/app/repositories/room_repository.py`、`backend/app/services/room_service.py`、`backend/app/services/message_service.py` |
| 3 | 共有リンク経由の閲覧系・書き込み系テスト追加 | `backend/tests/integration/test_rooms.py`、`backend/tests/integration/test_messages.py` |
| 4 | 動作確認記録・タスクリスト更新 | `docs/issue-114/06_タスクリスト.md`、`docs/issue-114/07_gitコミット.md`、`docs/issue-114/08_動作確認.md` |

## 各コミットメッセージ案

```text
#114 issue-114 00〜06ドキュメントを作成
    - 共有リンク経由のグループメンバーによる閲覧系APIアクセス制御拡張の要件定義・基本設計・詳細設計・テスト設計を作成
```

```text
#114 issue-114 共有リンク経由のグループメンバーに閲覧系APIのアクセスを許可
    - room_repository.find_page_by_login_idをfind_page_viewable_by_userに置き換え、所有ルームに加え共有先グループのルームも一覧取得できるようにした
    - room_service.get_roomをrequire_viewable_room（issue-65で先行実装済み）ベースに変更した
    - message_service.get_messages_and_assistants・get_message_contentsを閲覧権限判定（can_view_room/require_viewable_room）ベースに変更した
    - 書き込み系API（メッセージ送信・削除、ルーム更新・削除・固定・フィードバック等）は所有者限定のまま変更していない
```

```text
#114 issue-114 共有リンク経由の閲覧系・書き込み系の回帰テストを追加
    - test_rooms.py・test_messages.pyに共有先グループメンバーのfixtureとテストケースを追加した
    - get_roomの404→403の挙動変更に合わせ既存テストを更新した
```
