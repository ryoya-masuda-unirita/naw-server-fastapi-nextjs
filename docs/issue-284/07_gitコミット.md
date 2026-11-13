# 07_gitコミット

## コミット分割案

| # | コミット内容 | 対象ファイル |
|---|---|---|
| 1 | 設計ドキュメント | `docs/issue-284/*` |
| 2 | 実装・テスト・README | `frontend/**` |

## 各コミットメッセージ案

```
#284 issue-284 チャット画面の中核（新規チャット・ルーム・送信・メッセージ表示）をReactに移植
    - ChatNewPage・AdminChatRoomPage と chat-window・chat-input・chat-message-*・chat-header などを移植
    - サイドバーの新しいチャットダイアログを本物にした
    - chat-store・use-chat-input-controls・pending-message を追加
    - 別 Issue（#286・#287・#288）の部品を差し込む口を用意した
```
