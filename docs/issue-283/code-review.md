# code-review 結果

`/code-review high 322` の結果。🔴（致命的）の指摘はなし。

## 指摘一覧

| # | 重大度 | ファイル | 指摘内容 | 対応 |
|---|---|---|---|---|
| 1 | 🟡 注意 | `components/shared/markdown-view.tsx` | mermaid の未完成な図がエラー図（bomb）を body 直下に残す | 対応済み |
| 2 | 🟡 注意 | `store/messages-store.ts` | ルーム切替後に遅れて届いた応答が state を上書きする（読み込み） | 対応済み（読み込みのみ） |
| 3 | 🟡 注意 | `store/rooms-store.ts` | 古い検索の応答が新しい検索結果を上書きする | 対応済み |
| 4 | 🟡 注意 | `store/messages-store.ts` | 楽観的な送信メッセージが作成 API の応答まで表示されない | 対応しない |
| 5 | 🟡 注意 | `lib/chat/message-content-endpoint.ts` | `??` のため空の endpoint.model が assistant.model に落ちない | 対応済み |
| 6 | 🟡 注意 | `lib/chat/message-content-stream.ts` | 途中で例外が出ても接続を閉じない | 対応済み（signal の受け口は対応しない） |
| 7 | 🟡 注意 | `store/messages-store.ts` | 編集失敗時の全体巻き戻しがサーバー上の作成済みメッセージ・並行更新と合わない | 対応しない |
| 8 | 🟡 注意 | `components/shared/markdown-view.tsx` | `chartBlocks` だけ切り替えるとチャートが戻らない | 対応済み |
| 9 | 🔵 提案 | `store/messages-store.ts` | `@/lib/api-client` の import が 2 回 | 対応済み |
| 10 | 🔵 提案 | `lib/utils/room-name.ts` ほか | 呼び出し元のない関数が残っている | 対応済み |

## 詳細

### 1. mermaid のエラー図が残る（🟡）→ 対応済み

`MERMAID_OPTIONS` に `suppressErrorRendering: true` を追加した（mermaid 11.16.0 の設定項目）。ストリーミング中の未完成な図が構文エラーになっても、エラー図を DOM に残さない。移植元（ngx-markdown）にはない設定で、02・PR 本文の差分として記録した。テストで初期化オプションを確認している。

### 2. ルーム切替後の古い応答（🟡）→ 対応済み（読み込みのみ）

`loadMessagesForRoom` に連番を持たせ、古い連番の応答（本文取得まで含む）は state にも `isLoading` にも反映しない。`clearMessages` でも連番を進めるため、ルームを離れたあとに届いた応答は捨てられる。テストで「A の読み込み中に B へ切り替え、A の応答が後から届く」ケースを確認している。

`sendMessage` の応答待ち中にルームを切り替えるケースは、移植元の挙動のまま（対応しない）。送信は画面を離れても続けて回答を受け取る作りで、ルーム切替時の扱い（送信中の中断・別ルームへの反映の抑止）は、チャット画面（#284）がルーム切替をどう扱うかと合わせて決めるのが妥当なため。#284 への申し送りとする。

### 3. 古い検索の応答（🟡）→ 対応済み

`searchRooms` に連番を持たせ、古い連番の応答（成功・失敗とも）は結果にも `isSearchLoading` にも反映しない。テストで確認している。

### 4. 楽観的な送信メッセージが表示されない（🟡）→ 対応しない

移植元の `buildVisibleThread` が同じ作りで（`messageId` が records にない仮のターンは、records があるルームでは作成 API の応答で id が差し替わるまで描かない）、移植元と同じ挙動。作成 API は短時間で返る。完璧なクローンを優先し、見た目の変更は #284 で移植元と見比べて必要なら行う。

### 5. `??` のフォールバック（🟡）→ 対応済み

`endpoint.model` が空白のときも `assistant.model` を使うよう `||` にした。移植元は `??` だが、空文字を採用して SECURE の model が空になる実害があるため、意図的に直した（PR 本文に記載）。テストを追加。なお store 側の `resolveSecureContentModel` はもともと `||` でアシスタント一覧の model にフォールバックする。

### 6. 途中の例外で接続を閉じない（🟡）→ 対応済み（signal は対応しない）

読み取り中に例外が出たら `reader.cancel()` を呼んでから投げ直す。テストで確認している。`AbortSignal` を受け取って中断する口は、中断の UI（停止ボタン）が移植元にないため追加しない（`apiClient.stream` は `signal` を既に受け取れるので、必要になれば `streamMessageContent` から通すだけでよい）。

### 7. 編集失敗時の巻き戻し（🟡）→ 対応しない

移植元の `editMessage` と同じ（snapshot で全体を戻す）。サーバー側に作成済みの版が残る点も移植元と同じで、再読み込みで解消する。送信・再生成のように該当ターンだけ ERROR にする方式への変更は、移植元との挙動差になるため行わない。`rateMessage` の巻き戻しも移植元どおり。

### 8. `chartBlocks` の切り替え（🟡）→ 対応済み

`html` が変わらないまま `chartBlocks` だけが切り替わると、差し替え済みの DOM が戻らない。wrapper の `key` に `chartBlocks` を入れ、切り替え時は DOM を作り直す。`mermaid` の切り替えは HTML 自体が変わるため問題ない。テストを追加。

### 9. import の重複（🔵）→ 対応済み

1 つにまとめた。

### 10. 未使用の関数（🔵）→ 対応済み

`normalizeRoomName`・`isValidRoomName`・`buildShareUrl`・`buildLocalLibraryContentUrl`・`buildLocalLibraryUrl`・`getRoomListTotalCount` を削除（テストも）。ルーム名の変更ダイアログ（#285）・共有（#287）・ビューワー（#288）が使う予定のため、各 Issue で移植元から追加する（移植元: `core/utils/room-name.helpers.ts`・`core/utils/share-url.util.ts`・`features/chat/utils/message-content-endpoint.resolver.ts`・`core/utils/room-list-mapper.util.ts`）。
