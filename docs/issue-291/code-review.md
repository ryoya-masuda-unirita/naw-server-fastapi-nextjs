# code-review 結果

🔴 致命的: 0 件

差分を自己レビューした（code-review スキルは使わず手動）。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `chat-history-detail.tsx` | 開発時の StrictMode では effect の開く→後始末→開くが走り、メッセージを 2 回読み込む（後始末の `startNewChat` で一度空になる） | 対応しない。本番では 1 回。移植元の `ngOnInit`/`ngOnDestroy` と同じ順序で、結果は同じメッセージに収束する |
| 2 | 🟡 注意 | `chat-history-detail.tsx` | effect の依存を `roomId` だけにし `react-hooks/exhaustive-deps` を無効化している | 対応しない。state の変化で読み込み直さない移植元の挙動を保つため。理由をコメントに書いた |
| 3 | 🔵 提案 | `chat-store.ts` | 管理者履歴の文脈を共有ルームと同じ `sharedRoomContext` に入れている | 対応しない。移植元も同じ置き場を使い、`useActiveRoom` が ID を照合する |
