# NG: 18_フィードバック管理

52 項目の実行結果。**NG は 1 件**（React / backend が移植元と違う本当の差）。ほかに、移植元の画面・server にない操作のため `test.skip` にした項目が 8 件ある。

| 区分 | 項番 | 修正の対象 |
|---|---|---|
| NG（本当の差） | 18-25 | backend |
| 移植元にない操作（skip） | 18-16・17・18・19・35・50 | なし（移植元の画面にない） |
| 移植元でも成立しない（skip） | 18-30・31 | なし（移植元 server が受け付けない） |

## [18-25] 満足度：学習先フォルダフィルター

- 項目書の期待: 満足度フィルターで学習先フォルダを選ぶと、該当フォルダのデータだけが表示される
- 移植元の挙動: `server/.../service/FeedbackService.java` の `getFeedbackRooms`。`folderId` があれば `fileRepository.findRoomIdsByIndexId(folderId, tenantId)` で対象ルーム ID を先に取り、`id IN (...)`（空なら 0 件）で絞る
- React / backend の挙動: React（`satisfaction-tab.tsx`）は `folderId` を送る。backend は `GET /api/admin/feedbackRoom` で `folderId` を受け取らず、絞り込みもしない。フォルダを選んでも全件（学習先のないルームを含む）が返る（テストで、学習先フォルダを持つルームを 1 件用意し、応答の `indexId` がすべてそのフォルダではないことを確認）
- 原因:
  - `backend/app/schemas/feedback.py` の `FeedbackRoomListRequest` に `folderId` がない
  - `backend/app/services/feedback_service.py` の `get_feedback_rooms` と `backend/app/repositories/room_repository.py` の `find_feedback_rooms` に、フォルダでの絞り込みがない
- 修正の方針（backend）: `FeedbackRoomListRequest` に `folderId` を足し、`FileRepository` に「フォルダ ID から `files.room_id` の一覧を引く」処理を足して、`find_feedback_rooms` に渡す（空なら 0 件）

## 移植元の画面にない操作（skip）

- 18-16・17・18・19・35・50（行のチェックボックス・全選択・「選択を解除」・一括の学習先指定）: 移植元の現行 client（`accuracy-tab`・`satisfaction-tab`）に UI がない。項目書の 1・2 回目の「OK」は、この UI が削除される前の結果と思われる。React が移植元と同じ（UI なし）なので、差ではない

## 移植元でも成立しない（skip）

- 18-30・31（満足度タブの「追加学習順」「学習先フォルダ順」）: 画面の選択肢にはあるが、移植元 server の `FeedbackRoomListRequest.sortField` は `^(updatedAt|chat|name|level)$` のみで、`add`・`folder` はバリデーションエラーになる。backend も同じ（`name`・`chat`・`level`・`updatedAt` のみ）。項目書でも 1・2 回目は未実施（`-`）

## 項目書の文言と移植元の実装が違うが、React / backend は移植元と同じもの（OK）

- 18-08・28（アシスタント名順）: 移植元は表示名ではなくアシスタント ID（`message.assistantId`・`defaultAssistantId`）で並べる。backend も ID で並べるので、テストは ID の順で確かめた
- 18-10・11（追加学習順・学習先フォルダ順）: 移植元は両方とも `indexId` で並べる（フォルダ名順ではない）。backend も同じ
- 18-09・29（精度順・満足度順）: 移植元の `rating` は varchar のため文字列順。backend は `enum_as_string` で同じ文字列順にしている

## テストの誤りだったもの（直した）

- 一覧の質問文に `-` を含めると、画面の要約（`toPlainTableCellText`）が `-` を取り除くため、行を見つけられなかった（18-15・51）。`-` を含まない文言にした
- seed のフィードバックは更新日時がすべて同じで、更新日時だけで並べる移植元（backend も）ではページ送りで行が重複して見えた（18-13）。テストの準備で更新日時を 1 分ずつずらした。回答数タブの更新日時は未回答のユーザーが全員 NULL のため、ページ送りはユーザー表示名順で確かめた（18-45）
- 「学習先フォルダを選択」はテキストではなく入力欄の placeholder（18-51）
- 追加学習の登録後は画面が一覧を読み直すため、登録 API の応答本文は読めない（18-34）
