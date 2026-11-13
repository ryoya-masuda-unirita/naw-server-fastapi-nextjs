# チャットの土台（#283）の使い方

チャット画面の中核（#284 以降）が使う部品。移植元は `client/src/app/features/chat/` の `services`・`utils` と `shared` の Markdown・チャート描画。

> このディレクトリ（`src/features/chat/`）には、この README だけを置く。部品の実体は下の表のとおり、`frontend/.claude/CLAUDE.md` のディレクトリ構成（`components/` `hooks/` `store/` `lib/`）に従って置いている。

| 部品 | 場所 | 移植元 |
|---|---|---|
| Markdown・チャート・mermaid の描画 | `components/shared/markdown-view.tsx` | `<markdown mermaid appChartBlocks>`・`ChartBlockDirective` |
| SSE の読み取り | `lib/utils/sse-parser.ts`・`lib/chat/message-content-stream.ts` | `core/utils/sse-parser.ts`・`MessageContentStreamService` |
| メッセージの状態と操作 | `store/messages-store.ts` | `MessageService`（`messages.service.ts`） |
| ルーム一覧の状態と操作 | `store/rooms-store.ts` | `RoomsService`（`rooms.service.ts`） |
| アシスタント一覧 | `hooks/use-assistants.ts` | `AssistantsService.assistantsQuery` |
| アシスタント一覧・query cache が要る操作 | `hooks/use-chat-actions.ts` | `RoomsService`・`MessageService` の `queryClient` を使う部分 |
| スレッド（版）の組み立て・履歴・取得先の判定 | `lib/chat/message-thread.ts`・`message-history.ts`・`message-content-endpoint.ts`・`message-contents-api.ts` | `features/chat/utils/*`・`MessageContentsApiService` |

## 1. Markdown の描画（`MarkdownView`）

```tsx
import { MarkdownView } from '@/components/shared/markdown-view';

// チャットの回答（移植元 chat-message-item）
<div className="chat-message-bubble">
  <MarkdownView data={message.answer} />
</div>

// ライブラリのビューワー（移植元 chat-summary）
<MarkdownView data={markdown} className="chat-message-bubble viewer-markdown" />
```

- `data` を更新するたびに HTML を作り直し、チャートと mermaid を描き直す。ストリーミング中の回答をそのまま渡してよい
- チャートは ` ```chart:line ` / ` ```chart:bar ` / ` ```chart:pie ` のコードブロック（JSON のスキーマは `lib/utils/chart-block.ts`）。JSON が未完成・不正なら、グラフにせず元のコードブロックを残す。描画は SVG、コンテナは `.chart-block`（`index.css` に定義済み）
- mermaid は ` ```mermaid ` のコードブロック。`securityLevel: 'strict'`。初回に必要になったときだけ `mermaid` を読み込む（別チャンク）。構文エラーはコンソールに警告を出すだけで画面は変えない
- 移植元と違う点: HTML は DOMPurify で無害化する（移植元は `disableSanitizer` で AI の回答の HTML をそのまま挿入）。`class`（`language-chart:*`・`mermaid`）は残る

## 2. SSE の受信

`lib/chat/message-content-stream.ts` の `streamMessageContent` が `POST /api/messages/content` の SSE を読む。通常は store 経由で使うため、直接呼ぶ必要はほとんどない。

```ts
const message = await streamMessageContent(formData, localMessageId, {
  onReasoningDelta: (text) => { /* 思考過程 */ },
  onTextDelta: (text) => { /* 回答の本文（差分） */ },
  onLibraryTitleDelta: (text) => { /* ライブラリのタイトル（差分） */ },
  onLibraryContentDelta: (text) => { /* ライブラリの本文（差分） */ },
  onMessageStop: ({ inputTokens, outputTokens }) => { /* 終了時のトークン数 */ },
  onMessageContent: (item) => { /* 確定した回答。最後に 1 回 */ },
}, target);
```

- 戻り値は最後の `message_content` を変換した assistant の `Message`。届かずに終わったときは `Error` を投げる。HTTP エラーは `ApiError`
- **接続先の差し替え（#289）**: `target` に `{ kind: 'naw' }`（既定。`API_PATHS.MESSAGES.CONTENT`）か `{ kind: 'local', contentUrl, apiKey }`（SECURE アシスタントのローカルサーバー）を渡す。ローカルは `apiClient.stream` に絶対 URL・`X-Server-Auth-Key`・`credentials: 'omit'`・`omitTenantId: true` で送る（移植元の `fetch` 直呼びと同じく Cookie と `X-Tenant-ID` は付けない）
- `apiClient` に `omitTenantId` オプションを足した（`X-Tenant-ID` を付けない）。ローカルサーバーの CORS が未知のヘッダーを許可しない場合に備えた

## 3. メッセージ（`useMessagesStore`）

```tsx
const { isLoading, isGenerating, loadError } = useMessagesStore();
const visibleMessages = useVisibleMessages();            // 表示中の版だけをたどった並び
const versionInfo = useVersionInfoByMessageId();         // user メッセージごとの「2 / 3」の情報
const { loadMessagesForRoom, sendMessage, switchVersion, editMessage,
        regenerateMessage, retryMessage, webSearchRetryMessage, deleteMessage, clearMessages } =
  useMessagesStore.getState();

await loadMessagesForRoom(roomId, true);                  // true で isLoading を立てる
await sendMessage(text, files, roomId, attachedFiles, { assistantId, useWebSearch, additionalPrompt, createLibrary });
switchVersion(versionInfo.groupKey, 'prev');
```

- 送信・再生成・編集は SSE の差分をそのまま `messages` に反映する（`status: 'STREAMING'`）。失敗したら送信・再生成は assistant を `ERROR` に、編集は編集前の状態へ戻す。`isGenerating` は必ず戻る
- `loadError` は `'forbidden'`（403）・`'general'`・`null`。本文の取得に一部失敗したときはトーストを出し、そのメッセージは `ERROR` になる
- `rateMessage` は評価を先に画面へ反映し、失敗したら戻して例外を投げる。**フィードバック管理画面の一覧の再取得は `useChatActions().rateMessage` が行う**ので、画面からはそちらを呼ぶ
- store は query cache を読めないため、アシスタント一覧は `useChatActions()` が `setAssistantCatalog` で渡す（ルーム名の自動変更・SECURE の model に使う）。チャット画面で `useChatActions()` を 1 回呼ぶこと
- ライブラリ生成中の途中経過は `lib/chat/library-stream-bridge.ts` の `setLibraryStreamBridge()` に登録された窓口へ流す。ビューワー（#288）の store が登録する。未登録なら捨てる
- SECURE アシスタント（ローカルサーバー）: 接続先の判定・トークンの取得（`lib/chat/local-content-token.ts`）・本文の取得・送信先の切り替えまで移植済み。#289 は結合の確認（backend の `GET /api/auth` に `token` があるか等）から始める

## 4. ルーム（`useRoomsStore`）

```tsx
const allRooms = useRoomsStore((s) => s.allRooms);
const pinnedRooms = useRoomsStore(useShallow(selectPinnedRooms));
const { getAllRooms, loadNextRoomsPage, searchRooms, renameRoom, togglePinRoom,
        bulkUpdateRoomPins, saveRoomOrder, deleteRoom, deleteRooms, updateRoom } =
  useRoomsStore.getState();
const { createNewRoom, submitRoomFeedback } = useChatActions();
```

- 一覧は 20 件ずつ（`getAllRooms` で 1 ページ目、`loadNextRoomsPage` で続き）。`allRoomsHasMore` が false なら何もしない
- ピン留め・解除・並び替えは、一覧と検索結果の両方に反映する。保存した並び順（`lastSavedRoomOrder`）は一覧を読み直しても保つ
- 失敗は例外で返す（`getAllRooms` / `searchRooms` は一覧を空にしてから投げる）。トーストは出さない（api-client の共通エラートーストが出る）
- `createNewRoom` は backend の平らな応答・`{ data }` 包み・`pinned` 付きのどれでも読める

## テスト

`msw` の `server.use(...)` で API を差し替える。SSE は `new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } })` で返せる（例: `store/messages-store.test.ts`）。jsdom の `Blob` は `fetch` に渡すと本文が空になるため、`textData` の中身は `FormData.prototype.append` を監視して読む（同ファイルの `captureTextData`）。

## チャット画面（#284）と、別 Issue が差し込む口

画面の部品は `components/features/chat/`、ページは `routes/chat/chat-new.tsx`（`/dashboard`・`/chat/new`）と `routes/chat/chat-room.tsx`（`/chat/:roomId`）。

| 部品 | 場所 | 移植元 |
|---|---|---|
| 表示中のルーム（`activeRoomId`・`startNewChat`・`selectRoom`）・`useActiveRoom()` | `store/chat-store.ts` | `ChatService` のうち messages・rooms に属さない部分 |
| 入力欄の状態（アシスタント・Web 検索・テンプレート・ライブラリ作成・添付） | `hooks/use-chat-input-controls.ts` | `ChatInputComponent` の signal |
| 新規チャットで預けた最初のメッセージ | `lib/chat/pending-message.ts` | `router.navigate` の `state.pendingMessage` |
| ウィンドウ・ヘッダー・一覧・メッセージ・入力欄・ビューワーの枠 | `chat-window`・`chat-header`・`chat-message-list`・`chat-message-item`・`chat-message-footer`・`chat-input`・`chat-data-panel` | 同名の `chat-*` |

### 別 Issue の部品を差し込む口（未指定なら移植元と同じ位置の空の領域）

`ChatInput` の `renderXxx` は `ChatInputControls`（`use-chat-input-controls.ts`）を受け取る。`ChatWindow` の `inputSlots` でまとめて渡す（ページが `ChatWindow` に渡す）。

| 口 | 位置 | 担当 |
|---|---|---|
| `renderMention`・`onTextareaKeyDown` | textarea の上（候補パネル）・キー入力 | #286（実装済み） |
| `renderToolbar` | 送信ボタンの左（有効な機能ウィジェット・アシスタント選択） | #286（実装済み） |
| `renderAddMenu` | 「＋」ボタンの位置（添付・Web 検索・ライブラリ作成・テンプレート） | #286（実装済み。添付の項目は入力欄内の `input[type=file]` を `click()` する） |
| `renderAttachments`・`renderDropzone`・`onDropFiles` | 添付チップ列・ドロップ領域 | #287（実装済み。`ChatWindow` が `chatAttachmentSlots` を既定で渡す） |
| `ChatWindow` の `onShareClick`・`onLikeClick` | ヘッダーの共有・評価ボタン | #287（実装済み。未指定なら `useChatRoomDialogs` の共有・評価ダイアログを開く） |
| `ChatWindow` の `renderViewer`・`ChatDataPanel` の `renderSummary` | モバイルのビューワー・右のビューワー本体 | #288 |

- 送信は `ChatWindow` が行う。ルームがなければ `useChatActions().createNewRoom` で作り、`pending-message` に預けて `/chat/:roomId` へ移り、移動先（`AdminChatRoomPage`）が送る
- `ChatNewRoomDialog` は移植元でも開く手段がない（ヘッダーのボタンがコメントアウト）。部品だけ移してある
- `AdminChatRoomPage` はサイドバーのルーム一覧（#285）が未移植の間、一覧がなければ読み込む（ヘッダーのルーム名のため）
- ルーム一覧（ヘッダーのルーム名の元）はサイドバー（`components/layouts/sidebar.tsx`、#285）がマウント時に読み込む。`AdminChatRoomPage` は読み込まない

### アシスタント選択・メンション・「＋」メニュー・試験（#286）

`components/features/chat/chat-input-slots.tsx` の `CHAT_INPUT_SLOTS`（`renderMention`・`renderAddMenu`・`renderToolbar`・`onTextareaKeyDown`）を、`ChatWindow` が `ChatInput` に既定で渡す。`inputSlots` に同じ名前を渡すとそのスロットだけ上書きする（添付など別のスロットを足すだけなら、触らなくてよい）。

| 部品 | 場所 | 移植元 |
|---|---|---|
| アシスタント選択 | `chat-assistant-selector.tsx` | `chat-assistant-selector` |
| メンション候補・キー処理 | `chat-mention.tsx`・`chat-assistant-mention-panel.tsx`・`lib/chat/mention-key-handler.ts` | `chat-assistant-mention-panel`・`chat-input` の `handleKeyDown` |
| 「＋」メニュー・テンプレート選択 | `chat-add-menu.tsx`・`template-selector.tsx`・`hooks/use-prompt-templates.ts` | `chat-input`・`template-selector` |
| 有効な機能 | `active-features-widget.tsx`・`chat-input-toolbar.tsx` | `active-features-widget` |
| アシスタント試験（`/chat/assistant`） | `chat-assistant-exam.tsx`・`routes/chat/chat-assistant.tsx`（`ChatWindow` の `isChatExamList`） | `chat-assistant-exam`・`ChatAssistantComponent` |

- メンション候補・ウィジェットのパネルなど、スロットをまたぐ UI 状態は `store/chat-input-ui-store.ts`
- 「＋」メニューの添付項目は、入力欄内の `input[type=file]`（#287 が `renderDropzone` に置く）をクリックする

## 添付・評価・検索・共有（#287）

| 部品 | 場所 | 移植元 |
|---|---|---|
| 添付（ドロップ領域・チップ列） | `components/features/chat/chat-attachments.tsx`（`ChatAttachmentDropzone`・`ChatAttachmentChips`）・`chat-attachment-slots.tsx`（`chatAttachmentSlots`）・`lib/utils/chat-attachment.ts`・`lib/constants/chat-attachment.ts` | `chat-input` の添付・`chat-attachment.constants.ts` |
| 評価ダイアログ | `chat-rating-dialog.tsx` | `chat-rating-dialog` + `ChatWindow.openRatingDialog` |
| 共有ダイアログ | `chat-share-dialog.tsx` | `chat-share-dialog` + `ChatWindow.openShareDialog` |
| 上の 2 つを開く hook | `use-chat-room-dialogs.tsx` | `ChatWindow` |
| チャット検索 | `chat-search-modal.tsx`（サイドバーが開く） | `chat-search-modal` |
| 共有 API・チーム一覧 | `store/shares-store.ts`・`store/teams-store.ts` | `SharesService`・`TeamsService` |
| 添付ファイル・共有ルームの文脈 | `store/chat-store.ts`（`attachedFiles`・`sharedRoomContext`・`openSharedRoom`・`clearSharedRoomContext`） | `ChatService` |

- `renderDropzone` に、移植元と同じ `<input type="file" id="chat-file-upload" data-testid="chat-attach-file-input">` を置く（#286 の「＋」メニューの添付項目がこれを `click()` する）
- **共有閲覧画面（#288）**: `useSharesStore.getState().resolveShareAccess(shareId)` で共有情報を取り、`useChatStore.getState().openSharedRoom(access, shareId)` で開く。画面を離れるときは `clearSharedRoomContext()`。`ChatWindow` の `isReadOnly` に `access.isReadOnly` を渡すと、共有ダイアログは変更不可になる
- `Dialog` に `autoFocus` を足した（共有ダイアログは `autoFocus: false`。先頭の `ComboboxMulti` が、フォーカスされて勝手に開くのを防ぐ）


## サイドバーのルーム一覧（#285）

- `sidebar.tsx` がチャットのセクション（`SIDEBAR.CHAT`）を作り、ピン・操作メニュー・バッジは `sidebar/sidebar-route-button.tsx`、メニューは `chat-room-menu.tsx`（名前変更・ピン・削除）・`chat-context-menu.tsx`、まとめて削除は `chat-delete-dialog.tsx`、ピンの一括変更は `chat-sort-dialog.tsx`
- 移植元でも `chat-context-menu` を開くボタンと `openSortDialog` の呼び出し元がない。部品と配線だけ移してあり、画面からは開けない
- `PUT /api/rooms/pin`・`PUT /api/rooms/reorder` は移植元 server にも無く、呼ぶと失敗する（移植元の画面と同じ）
