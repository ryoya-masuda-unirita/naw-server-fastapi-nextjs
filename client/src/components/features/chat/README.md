# チャットの部品の使い方

チャット画面の部品（`components/features/chat/`）と、それを支える store・hook・lib を使う人向けの README です。

- チャットの状態は、メッセージ（`useMessagesStore`）、ルーム（`useRoomsStore`）、表示中のルーム（`useChatStore`）の 3 つの store が持つ
- 画面は `ChatWindow` を置くだけで動く。入力欄の機能（メンション・添付など）は「スロット」で差し込む
- 通信は SSE。通常は store 経由で使い、`streamMessageContent` を直接呼ぶ必要はほとんどない

起票元の Issue は #283（土台）・#284（画面）・#285〜#291（各機能）。移植元は `client/src/app/features/chat/`（Angular）です。

## やりたいこと別の早見表

| やりたいこと | 使うもの | 節 |
|---|---|---|
| 回答の Markdown・チャート・図を表示する | `MarkdownView` | 1 |
| メッセージを送る・再生成する・編集する | `useMessagesStore` | 3 |
| ルーム一覧を読む・ピン留め・名前変更・削除する | `useRoomsStore` | 4 |
| チャット画面（ページ）を作る | `ChatWindow` | 5 |
| 入力欄に機能を足す・差し替える | スロット（`inputSlots`） | 6 |
| 添付・評価・共有・検索を使う | 各ダイアログ・store | 7 |
| ビューワー・ライブラリ詳細を使う | `viewer-store`・`ChatSummary` | 8 |
| 通信を自動テストで確かめる | MSW | 9 |

## 部品の置き場所

チャットの部品は、`client/.claude/CLAUDE.md` のディレクトリ構成に従って、`src/` の下の複数の場所にある（表のパスは `src/` から）。

| 部品 | 場所 | 移植元 |
|---|---|---|
| Markdown・チャート・mermaid の描画 | `components/shared/markdown-view.tsx` | `<markdown mermaid appChartBlocks>`・`ChartBlockDirective` |
| SSE の読み取り | `lib/utils/sse-parser.ts`・`lib/chat/message-content-stream.ts` | `core/utils/sse-parser.ts`・`MessageContentStreamService` |
| メッセージの状態と操作 | `store/messages-store.ts` | `MessageService` |
| ルーム一覧の状態と操作 | `store/rooms-store.ts` | `RoomsService` |
| アシスタント一覧 | `hooks/use-assistants.ts` | `AssistantsService.assistantsQuery` |
| query cache が要る操作 | `hooks/use-chat-actions.ts` | `RoomsService`・`MessageService` の `queryClient` を使う部分 |
| スレッド（版）の組み立て・履歴・取得先の判定 | `lib/chat/message-thread.ts`・`message-history.ts`・`message-content-endpoint.ts`・`message-contents-api.ts` | `features/chat/utils/*`・`MessageContentsApiService` |
| 表示中のルーム | `store/chat-store.ts` | `ChatService` のうち messages・rooms に属さない部分 |
| 入力欄の状態 | `hooks/use-chat-input-controls.ts` | `ChatInputComponent` の signal |
| 新規チャットで預けた最初のメッセージ | `lib/chat/pending-message.ts` | `router.navigate` の `state.pendingMessage` |

## 1. Markdown を表示する（`MarkdownView`）

```tsx
import { MarkdownView } from '@/components/shared/markdown-view';

// チャットの回答（移植元 chat-message-item）
<div className="chat-message-bubble">
  <MarkdownView data={message.answer} />
</div>

// ライブラリのビューワー（移植元 chat-summary）
<MarkdownView data={markdown} className="chat-message-bubble viewer-markdown" />
```

- `data` を更新するたびに、HTML を作り直し、チャートと mermaid を描き直す。ストリーミング中の回答をそのまま渡してよい
- チャートは ` ```chart:line `・` ```chart:bar `・` ```chart:pie ` のコードブロック。JSON のスキーマは `lib/utils/chart-block.ts`
  - JSON が未完成・不正なら、グラフにせず元のコードブロックを残す
  - 描画は SVG。コンテナは `.chart-block`（`index.css` に定義済み）
- mermaid は ` ```mermaid ` のコードブロック。`securityLevel: 'strict'`
  - 初回に必要になったときだけ `mermaid` を読み込む（別チャンク）
  - 構文エラーはコンソールに警告を出すだけで、画面は変えない
- 移植元と違う点: HTML は DOMPurify で無害化する（移植元は `disableSanitizer` で、AI の回答の HTML をそのまま挿入）。`class`（`language-chart:*`・`mermaid`）は残る

## 2. SSE を直接読む（`streamMessageContent`）

`lib/chat/message-content-stream.ts` の `streamMessageContent` が、`POST /api/messages/content` の SSE を読む。通常は store 経由で使う。

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

- 戻り値は、最後の `message_content` を変換した assistant の `Message`。届かずに終わったときは `Error`、HTTP エラーは `ApiError` を投げる
- 接続先は `target` で替える（#289）
  - `{ kind: 'naw' }`: 既定。`API_PATHS.MESSAGES.CONTENT` に送る
  - `{ kind: 'local', contentUrl, apiKey }`: SECURE アシスタントのローカルサーバーに送る
- ローカルへは、`apiClient.stream` に絶対 URL・`X-Server-Auth-Key`・`credentials: 'omit'`・`omitTenantId: true` を付けて送る。移植元の `fetch` 直呼びと同じく、Cookie と `X-Tenant-ID` は付けない
- `apiClient` に `omitTenantId`（`X-Tenant-ID` を付けない）を足した。ローカルサーバーの CORS が未知のヘッダーを許可しない場合に備えた

## 3. メッセージを扱う（`useMessagesStore`）

```tsx
const { isLoading, isGenerating, loadError } = useMessagesStore();
const visibleMessages = useVisibleMessages();            // 表示中の版だけをたどった並び
const versionInfo = useVersionInfoByMessageId();         // user メッセージごとの「2 / 3」の情報
const { loadMessagesForRoom, sendMessage, switchVersion, editMessage,
        regenerateMessage, retryMessage, webSearchRetryMessage, deleteMessage, clearMessages } =
  useMessagesStore.getState();

await loadMessagesForRoom(roomId, true);                  // true で isLoading を立てる
await sendMessage(text, files, roomId, attachedFiles, { assistantId, useWebSearch, additionalPrompt, createLibrary });
const info = versionInfo.get(message.id);                 // Map。値は { groupKey, current, total, canPrev, canNext }
if (info?.canPrev) switchVersion(info.groupKey, 'prev');
```

注意点:

- 送信・再生成・編集は、SSE の差分をそのまま `messages` に反映する（`status: 'STREAMING'`）
- 失敗したときは、送信・再生成は assistant を `ERROR` にする。編集は編集前の状態へ戻す。`isGenerating` は必ず戻る
- `loadError` は `'forbidden'`（403）・`'general'`・`null`。本文の取得に一部失敗したときはトーストを出し、そのメッセージは `ERROR` になる
- `rateMessage` は、評価を先に画面へ反映し、失敗したら戻して例外を投げる。フィードバック管理画面の一覧の再取得は `useChatActions().rateMessage` が行うので、画面からはそちらを呼ぶ
- store は query cache を読めない。アシスタント一覧は、`useChatActions()` が `setAssistantCatalog` で渡す（ルーム名の自動変更・SECURE の model に使う）。チャット画面で `useChatActions()` を 1 回呼ぶこと
- ライブラリ生成中の途中経過は、`lib/chat/library-stream-bridge.ts` の `setLibraryStreamBridge()` に登録された窓口へ流す。ビューワーの store（`store/viewer-store.ts`、#288）が、読み込み時に登録する。未登録なら捨てる

### SECURE アシスタント（ローカルサーバー）

接続先の判定・トークンの取得（`lib/chat/local-content-token.ts`）・本文の取得・送信先の切り替えまで、移植済み。

- #289 で結合（backend の `GET /api/auth` の `token`、server-local の CORS、メッセージ一覧の `apiKey`・`model`）を確認した。結果は `docs/issue-289/`
- ライブラリ本文の取得は `lib/chat/library-content-api.ts`（`fetchLibraryContent`）

### server-local との通し（手動）

自動テスト（MSW）では、実物の server-local に届かない。`onprem/` を起動して確かめる手動用のテストがある（`npm test` には含まれない）。

```bash
cd onprem && docker compose up -d --build server-local   # server-local と、depends_on で waha-emulator が起動する（ポート 18090）
cd ../client && npx vitest run --config vitest.e2e-local.config.ts
```

- `e2e-local/local-server.e2e.ts` が、preflight・送信（SSE）・ルームの読み込み（`POST /api/messages/contents`）・認証キー違いの 401 を確かめる
- NAW 側（メッセージ作成・`GET /api/auth`）は MSW で用意する
- 環境変数 `LOCAL_SERVER_URL`・`LOCAL_SERVER_KEY` で接続先を変えられる

## 4. ルームを扱う（`useRoomsStore`）

```tsx
const allRooms = useRoomsStore((s) => s.allRooms);
const pinnedRooms = useRoomsStore(useShallow(selectPinnedRooms));
const { getAllRooms, loadNextRoomsPage, searchRooms, renameRoom, togglePinRoom,
        bulkUpdateRoomPins, saveRoomOrder, deleteRoom, deleteRooms, updateRoom } =
  useRoomsStore.getState();
const { createNewRoom, submitRoomFeedback } = useChatActions();
```

注意点:

- 一覧は 20 件ずつ。`getAllRooms` で 1 ページ目、`loadNextRoomsPage` で続きを読む。`allRoomsHasMore` が false なら何もしない
- ピン留め・解除・並び替えは、一覧と検索結果の両方に反映する。保存した並び順（`lastSavedRoomOrder`）は、一覧を読み直しても保つ
- 失敗は例外で返す（`getAllRooms` と `searchRooms` は、一覧を空にしてから投げる）。トーストは出さない（api-client の共通エラートーストが出る）
- `createNewRoom` は、backend の平らな応答・`{ data }` 包み・`pinned` 付きのどれでも読める

## 5. チャット画面（ページ）を作る（#284）

画面の部品は `components/features/chat/`。ページは次の 2 つ。

- `routes/chat/chat-new.tsx`（`/dashboard`・`/chat/new`）
- `routes/chat/chat-room.tsx`（`/chat/:roomId`）

主な部品は、`chat-window`・`chat-header`・`chat-message-list`・`chat-message-item`・`chat-message-footer`・`chat-input`・`chat-data-panel`（移植元の同名の `chat-*`）。

- 送信は `ChatWindow` が行う
  - ルームがなければ、`useChatActions().createNewRoom` で作る
  - 最初のメッセージを `pending-message` に預けて `/chat/:roomId` へ移る
  - 移動先（`AdminChatRoomPage`）が送る
- `AdminChatRoomPage` は、サイドバーのルーム一覧（#285）が未読み込みなら読み込む。ヘッダーのルーム名の元になる一覧は、サイドバー（`components/layouts/sidebar.tsx`）がマウント時に読み込む
- `ChatNewRoomDialog` は、移植元でも開く手段がない（ヘッダーのボタンがコメントアウト）。部品だけ移してある

## 6. 入力欄に機能を差し込む（スロット）

`ChatInput` の `renderXxx` は、`ChatInputControls`（`use-chat-input-controls.ts`）を受け取る。`ChatWindow` の `inputSlots` でまとめて渡す。未指定のスロットは、移植元と同じ位置の空の領域になる。

| スロット | 位置 | 担当 |
|---|---|---|
| `renderMention`・`onTextareaKeyDown` | textarea の上（候補パネル）・キー入力 | #286 |
| `renderToolbar` | 送信ボタンの左（有効な機能ウィジェット・アシスタント選択） | #286 |
| `renderAddMenu` | 「＋」ボタンの位置（添付・Web 検索・ライブラリ作成・テンプレート） | #286 |
| `renderAttachments`・`renderDropzone`・`onDropFiles` | 添付チップ列・ドロップ領域 | #287 |
| `ChatWindow` の `onShareClick`・`onLikeClick` | ヘッダーの共有・評価ボタン | #287 |
| `ChatWindow` の `renderViewer`・`ChatDataPanel` の `renderSummary` | モバイルのビューワー・右のビューワー本体 | #288 |

どれも実装済み。既定の渡し方は次のとおり。

- #286 のスロットは、`chat-input-slots.tsx` の `CHAT_INPUT_SLOTS`（`renderMention`・`renderAddMenu`・`renderToolbar`・`onTextareaKeyDown`）を、`ChatWindow` が `ChatInput` に既定で渡す。`inputSlots` に同じ名前を渡すと、そのスロットだけ上書きされる。添付など別のスロットを足すだけなら、触らなくてよい
- #287 のスロットは、`ChatWindow` が `chatAttachmentSlots` を既定で渡す。`onShareClick`・`onLikeClick` が未指定なら、`useChatRoomDialogs` の共有・評価ダイアログを開く
- #288 のスロットが未指定なら、`ChatSummary` が入る
- 「＋」メニューの添付項目は、入力欄内の `input[type=file]` を `click()` する。その `input` は `renderDropzone` に置く（`<input type="file" id="chat-file-upload" data-testid="chat-attach-file-input">`）

### #286 の部品（アシスタント選択・メンション・「＋」メニュー・試験）

| 部品 | 場所（`components/features/chat/` から） | 移植元 |
|---|---|---|
| アシスタント選択 | `chat-assistant-selector.tsx` | `chat-assistant-selector` |
| メンション候補・キー処理 | `chat-mention.tsx`・`chat-assistant-mention-panel.tsx`・`lib/chat/mention-key-handler.ts` | `chat-assistant-mention-panel`・`chat-input` の `handleKeyDown` |
| 「＋」メニュー・テンプレート選択 | `chat-add-menu.tsx`・`template-selector.tsx`・`hooks/use-prompt-templates.ts` | `chat-input`・`template-selector` |
| 有効な機能 | `active-features-widget.tsx`・`chat-input-toolbar.tsx` | `active-features-widget` |
| アシスタント試験（`/chat/assistant`） | `chat-assistant-exam.tsx`・`routes/chat/chat-assistant.tsx`（`ChatWindow` の `isChatExamList`） | `chat-assistant-exam`・`ChatAssistantComponent` |

メンション候補・ウィジェットのパネルなど、スロットをまたぐ UI 状態は `store/chat-input-ui-store.ts` に置く。

## 7. 添付・評価・検索・共有（#287）

| 部品 | 場所 | 移植元 |
|---|---|---|
| 添付（ドロップ領域・チップ列） | `chat-attachments.tsx`（`ChatAttachmentDropzone`・`ChatAttachmentChips`）・`chat-attachment-slots.tsx`・`lib/utils/chat-attachment.ts`・`lib/constants/chat-attachment.ts` | `chat-input` の添付・`chat-attachment.constants.ts` |
| 評価ダイアログ | `chat-rating-dialog.tsx` | `chat-rating-dialog` + `ChatWindow.openRatingDialog` |
| 共有ダイアログ | `chat-share-dialog.tsx` | `chat-share-dialog` + `ChatWindow.openShareDialog` |
| 上の 2 つを開く hook | `use-chat-room-dialogs.tsx` | `ChatWindow` |
| チャット検索 | `chat-search-modal.tsx`（サイドバーが開く） | `chat-search-modal` |
| 共有 API・チーム一覧 | `store/shares-store.ts`・`store/teams-store.ts` | `SharesService`・`TeamsService` |
| 添付ファイル・共有ルームの文脈 | `store/chat-store.ts`（`attachedFiles`・`sharedRoomContext`・`openSharedRoom`・`clearSharedRoomContext`） | `ChatService` |

共有閲覧画面（#288）の使い方:

1. `useSharesStore.getState().resolveShareAccess(shareId)` で共有情報を取る
2. `useChatStore.getState().openSharedRoom(access, shareId)` で開く
3. 画面を離れるときは `clearSharedRoomContext()` を呼ぶ
4. `ChatWindow` の `isReadOnly` に `access.isReadOnly` を渡すと、共有ダイアログは変更不可になる

`Dialog` に `autoFocus` を足した。共有ダイアログは `autoFocus: false` にしている（先頭の `ComboboxMulti` がフォーカスされて、勝手に開くのを防ぐため）。

### 管理者のチャット履歴詳細（#291）

ページは `routes/admin/chat-history/chat-history-detail.tsx`（`/admin/chat-history/:roomId`）。一覧（#134）が `navigate` の state で渡す `roomName`・`userName`・`userId` を読む。

- `chat-store` の `openAdminHistoryRoom` / `clearAdminHistoryRoomContext` を使う（移植元 `ChatService`）。文脈は、共有ルームと同じ `sharedRoomContext` に入る
- `ChatWindow` を `showHeader={false}`・`isReadOnly` で使う。回答があれば、右に `ChatDataPanel` を出す
- 画面を離れると、文脈・表示中ルーム・メッセージを捨てる（移植元 `ngOnDestroy`）

### サイドバーのルーム一覧（#285）

- `components/layouts/sidebar.tsx` が、チャットのセクション（`SIDEBAR.CHAT`）を作る
- 部品は `components/layouts/sidebar/` にある
  - `sidebar-route-button.tsx`: ピン・操作メニュー・バッジ
  - `chat-room-menu.tsx`: 名前変更・ピン・削除のメニュー
  - `chat-context-menu.tsx`・`chat-delete-dialog.tsx`（まとめて削除）・`chat-sort-dialog.tsx`（ピンの一括変更）
- 移植元でも、`chat-context-menu` を開くボタンと `openSortDialog` の呼び出し元がない。部品と配線だけ移してあり、画面からは開けない
- `PUT /api/rooms/pin`・`PUT /api/rooms/reorder` は、移植元 server にも無く、呼ぶと失敗する（移植元の画面と同じ）

## 8. ビューワー・共有閲覧・ライブラリ詳細（#288）

| 部品 | 場所 | 移植元 |
|---|---|---|
| ビューワーの状態（一覧・選択・本文・ライブラリ生成中の表示） | `store/viewer-store.ts` | `ViewerService` |
| ビューワー本体 | `chat-summary.tsx`（`ChatSummary`・`ChatSummaryConnected`） | `ChatSummaryComponent` |
| 右パネル・モバイルへの既定の差し込み | `render-chat-summary.ts` | `<app-chat-summary>` |
| 「ライブラリに保存」ダイアログ | `chat-save-library-dialog.tsx`・`hooks/use-library-metadata.ts` | `ChatSaveLibraryDialogComponent`・`LibraryService` |
| 本文の取得（NAW／SECURE のローカルサーバー） | `lib/chat/library-content-api.ts` | `LibraryContentApiService` |
| PDF 保存 | `lib/utils/print-html-content.ts` | `printHtmlContent` |
| ページ | `routes/chat/chat-viewer.tsx`・`chat-shared.tsx`・`routes/library/library-detail.tsx`・`routes/chat-shared-history/`・`routes/feedback-preview/` | 各 Component |

`render-chat-summary.ts` は、`ChatDataPanel` の `renderSummary` と `ChatWindow` の `renderViewer` の既定を作る。

ライブラリを開くときの流れ:

- `viewer-store` が `fetchLibraryContent(libraryId)`（移植元 `LibraryContentApiService.fetch`）を呼ぶ
- 詳細（タイトル・アシスタント）を NAW から取る。SECURE なら、テナントの LOCAL_SERVER エンドポイントから本文を取る
- ローカルへの通信エラーは、共通エラートーストを出さず `ApiError` を投げる。`viewer-store` が catch して `contentLoadError` にする（移植元の `viewer.service.loadContent` と同じ）
- ローカル側の削除は、#136 の `lib/utils/library-local-copy.ts`

注意点:

- 資料の一覧は、`ChatDataPanel` が `roomId` が替わるたびに `loadList` で読む。モバイルのビューワーも同じ一覧を使うので、パネルが hidden でも読む。ビューワーだけのページ（viewer・library-detail）は自分で読む
- `ChatRoom` の右パネルは、回答があるか、「このルームのライブラリを生成中」のときに出す
- 共有閲覧は移植元どおり、`access.isReadOnly` に関係なく、`ChatWindow` と `ChatDataPanel` に常に `isReadOnly` を渡す
- ビューワー API の既定の MSW 応答は `mocks/handlers/viewer.ts`（チャット画面を開くと一覧を読むため）

## 9. テスト

`msw` の `server.use(...)` で API を差し替える。

- SSE は `new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } })` で返せる（例: `store/messages-store.test.ts`）
- jsdom の `Blob` は、`fetch` に渡すと本文が空になる。`textData` の中身は、`FormData.prototype.append` を監視して読む（同ファイルの `captureTextData`）
