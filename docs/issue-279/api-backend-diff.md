# 移植した API の型と backend の応答の差分

`frontend/src/types/`（移植元 `client/src/types/` の複製）と、`backend/app/routers`・`backend/app/schemas` の実際の応答・リクエストを比べた結果（2026-11-13、origin/develop c96e1b3 時点）。**backend は直していない。** 画面を移植するときは、使う API の行を見て、画面側で吸収するか、backend の Issue にするかを決める。

前提:

- backend の項目名はすべて camelCase（pydantic に alias なし）で、snake_case との食い違いはない
- 日時は ISO 8601 文字列（DB 列が timezone 付き）。`Z` か `+00:00` かは実際の JSON で未確認
- 移植元 Spring Boot（`server/`）が backend より新しい箇所がある（`hasLoginKey`、`AuthGroupResponse` の形、メッセージ一覧の assistants の項目）。差分の一部は backend の移植遅れが原因
- ★ は自分で backend のコードを読んで確かめた行。それ以外は調査エージェントの結果

## 1. 形が違うもの

| 型（`frontend/src/types/`） | API | 違い | backend の該当 |
|---|---|---|---|
| ★ `UserProfile`（`user.types.ts`） | GET `/api/users/profile` | 型は `hasLoginKey: boolean`。backend は `loginKey`（保存値そのもの）を返し、`hasLoginKey` が無い。ログインキーは秘密情報で、移植元 Spring Boot は `hasLoginKey` だけを返す。backend は余分に `isRequiredPasswordReset`・`totalCredits` を返す | `UserResponse` |
| ★ `UserApiItem`・`UserCreateApiResponse`・`UserUpdateApiResponse`（`admin/user.types.ts`） | GET/POST/PATCH `/api/admin/users` | 行に `hasLoginKey` が無く `loginKey` を返す。一覧の型にある `displayName`・`accountType`・`email`・`updatedAt` が無い | `UserResponse`・`UserCreateResponse`・`UserUpdateResponse` |
| ★ ユーザー一覧のページング（`PagedResponse`） | GET `/api/admin/users` | backend は `content`・`totalElements`・`totalPages`・`page`・`size`。**`number` ではなく `page`**。`number` を読むとページ番号が取れない | `PagedUserResponse` |
| `LoginKeyAction`（`admin/user.types.ts`） | PATCH `/api/admin/users/{loginId}` | 型は `loginKeyAction`（KEEP/REISSUE/REVOKE）を送る。backend は `loginKey`・`resetPassword` しか受けない | `UserUpdateRequest` |
| ★ 認証の `groups`（React の `types/auth.ts` の `GroupDTO`） | POST `/auth/login`・`/auth/login-key`・`/auth/password/reset`、GET `/api/auth` | 型は `{ groupId, groupAdmin }`。backend は `{ id, name }` で、しかも `groups=[]` を固定で返す。移植元 Spring Boot は `{ groupId, groupAdmin }` | `AuthResponse`・`AuthGroupResponse` |
| `PlanResponse`・`SubscriptionResponse`（`common.ts`） | GET `/api/admin/tenants` | `maxCreditsPerDay`・`alertPercentage`・`dailyAlertPercentage` が backend に無い。`maxCreditsPerMonth`・`endDate`・`subscription` は backend では null あり | `PlanResponse`・`SubscriptionResponse` |
| `TenantInfo`（`admin/tenant.types.ts`） | GET `/api/admin/tenants` | 型は `deleted` と `isDeleted` の両方。backend は `isDeleted` のみ。`resources[].description` は null あり。backend だけに `maxUsageBasedCreditsPerMonth`・`createdAt`・`updatedAt` | `TenantDetailResponse` |
| `Endpoint`（`admin/tenant.types.ts`） | GET/POST/PATCH `/api/admin/tenants/{id}/endpoints` | 型は `apiKey` を持つが、backend の応答に `apiKey` は無い | `EndpointResponse` |
| `RoomListApiItem`・`RoomsListApiResponse`（`chat/chat-room.type.ts`） | GET `/api/rooms` | ページングは一致。行に `rating`・`shareUrl`・`teamIds` が無い（型は `rating`・`shareUrl` を必須扱い） | `RoomListItemResponse`・`PagedRoomResponse` |
| `CreateRoomResponse`・`RenameRoomResponse`（同上） | POST `/api/rooms`、PATCH `/api/rooms/{id}` | backend は平らな `RoomResponse`（`pinned`・`rating`・`shareUrl`・`teamIds` 無し）。作成の型は `{ data }` 包みと平らの両方を受ける | `RoomResponse` |
| ★ `DeleteRoomResponse`・`RoomFeedbackResponse`（同上） | DELETE `/api/rooms/{id}`、POST `/api/rooms/{id}/feedback` | backend は 204（本文なし）。型は本文を持つ。api-client は 204 で `null` を返す | なし |
| `MessagesListApiResponse`・`MessageListAssistant`（`chat/message-api.type.ts`） | GET `/api/messages?roomId=` | assistants に `includeHistory`・`model` が無く、endpoints に `model` が無い（移植元 Spring Boot にはある）。履歴を送るか・SECURE のモデルが取れない | `GetMessagesResponse`・`AssistantResponse`・`EndpointResponse` |
| `MessageContentApiItem`（同上） | POST `/api/messages/contents` | `attachmentFiles[]` は backend が `{ name, type, data }`（`data` は Base64）。型の `FileAttachment` は `id`・`size` を持つ。ERROR 時の `message` が backend に無い | `MessageContentResponse` |
| `MessageContentTextData`（同上） | POST `/api/messages/content`（multipart の `textData`） | 型の `accessToken`・`tenantId` を backend は受けない。`tools[].name` は backend が `web_search`・`mcp` のみ | `MessageContentCreateRequest` |
| `AssistantListApiItem`（`chat/assistant.type.ts`） | GET `/api/assistants` | `category` は型が `string | null`、backend は `{ id, name, description } | null`。`endpoints[].label` が無い。`description`・`iconColor` は backend で null あり | `AssistantGetResponse` |
| `AssistantApiItem`（`admin/assistant.types.ts`） | GET `/api/admin/assistants` | ページングは一致（`AssistantApiResponse` の `data/total/page/size` は古い形で未使用）。`endpoints[].label` が無い。`description`・`iconColor` は null あり | `PagedAssistantResponse` |
| `AssistantCategoryApiItem`（同上） | GET `/api/admin/assistant-categories` | `description` は backend で null あり | `AssistantCategoryResponse` |
| ★ `GroupApiResponse`（`admin/group-management.types.ts`） | GET `/api/admin/groups` | `PagedResponse` ではなく **`{ data, total, page, size }`**。型はこの形で一致 | `GroupListPageResponse` |
| `GroupMemberUserResponse`（同上） | GET `/api/admin/groups/{id}/users` | backend の行に `loginKey`（秘密情報）が入る | `GroupMemberUserResponse` |
| `PageMessageFeedback`・`PageRoomFeedback`・`PageFeedbackUser`（`admin/feedback.types.ts`） | GET `/api/admin/feedbackMessage`・`feedbackRoom`・`feedbackUser` | 型は Spring の `Page` の全項目（`sort`・`pageable`・`first`・`last`・`empty` など）を必須で持つ。backend は `content`・`totalElements`・`number`・`size`・`totalPages`・`numberOfElements` だけ | `PagedFeedback*Response` |
| `RoomFeedback`（同上） | GET `/api/admin/feedbackRoom` | `room` は型が `ChatRoom`（`isPinned`・`category` 必須）、backend は `RoomInfoResponse`（`id`・`name`・`defaultAssistantId`・`defaultAssistantName`・`rating`）。`indexId` が無い | `FeedbackRoomItemResponse` |
| `ChatHistoryApiItem`（`chat-history.types.ts`） | GET `/api/admin/histories` | `description` が無い（型は任意）。backend は余分に `indexIds`・`shareUrl`・`rating` を返す | `AdminRoomHistoryItemResponse` |
| ★ `ShareResponse`・`ShareAccessResponse`（`chat/share-api.type.ts`） | POST `/api/shares`、GET `/api/shares/{id}/access` | 移植元の画面は `{ data: ... }` で受けるが、backend は包まずに平らに返す | `ShareDataResponse`・`ShareAccessDataResponse` |
| `TrainingDataApiItem`（`training-data.types.ts`） | GET `/api/admin/indexes` | `endpointIds` が無く、代わりに `tenantEndpoints[]` を返す。`type` の値（`SAAS_GLOBAL`・`LOCAL`）は未突合 | `IndexResponse` |
| `TrainingDataFile`（同上） | GET `/api/admin/indexes/{id}/files` | 型の `displayName`・`reference`・`updatedBy`・`chunkSize`・`image` などに対し、backend は `fileName`・`storageUrl`・`feedbackId`・`roomId` などを返す | `FileResponse` |
| `TokenUsageSummaryResponse`（`token-usage.type.ts`） | GET `/api/admin/token-usages/summary` | backend は余分に `embeddingTokens`・`embeddingCredits` を返す（実害なし） | `TokenUsageSummaryResponse` |
| `CreditUsageResponse`（`credit-usage.type.ts`） | GET `/api/credit-usage/me`・`/workspace` | 形は一致（契約が無いときは `{}`） | `MyCreditUsageResponse`・`WorkspaceCreditUsageResponse` |

## 2. backend に API が無いもの

| API | 使う型 |
|---|---|
| GET `/api/token-usages?from=&to=`（一般ユーザー用。admin 用のみある） | `TokenUsageSummaryResponse` |
| PUT `/api/rooms/pin`（一括）・PUT `/api/rooms/reorder` | `BulkUpdateRoomPinsRequest` |
| GET `/api/messages/contents/{id}` | `MessageContentApiItem` |
| GET `/api/libraries/{id}/content` | `LibraryBodyResponse` |
| PATCH `/api/admin/tenants/{id}/usage-limit` | 上限更新（backend は PATCH `/api/admin/tenants/{id}` で代替） |
| GET・POST・PATCH・DELETE `/api/tags`・`/api/tags/{id}` | `TagItem` |
| `/api/admin/glossary/*`・`/api/user/glossary/*`（terms・tags・words・assistants・bulk-delete） | `admin/glossary*.types.ts` |
| GET `/api/admin/learning-folders` | 学習フォルダの選択肢 |
| GET `/api/admin/assistants/server-options`・`api-options`・`model-options`・`dictionary-options`、GET `/api/admin/assistant-categories/options` | `SelectOption[]` |

## 3. 一致を確認できたもの（主なもの）

- ページング応答 `PagedResponse`（`content`・`totalElements`・`number`・`size`）: rooms・admin assistants・admin prompt-templates・library-tags・indexes・files・feedback 系・admin histories。例外はユーザー一覧（`page`）・グループ一覧（`{ data, total, page, size }`）・ライブラリ一覧（`{ data: PagedResponse }`）
- POST `/api/messages`（`{ id }`）、GET `/api/messages` の行、DELETE `/api/messages/{id}`、POST `/api/messages/{id}/feedback`
- GET `/api/admin/groups/{id}`（`GroupDetailResponse`）、GET `/api/admin/prompt-templates`、POST/PATCH の作成・更新
- GET `/api/libraries`（`{ data: PagedResponse }`）、GET `/api/libraries/tags`（`{ tags }`）、PUT `/api/libraries/{id}`（`{ data: { id } }`）
- GET `/api/admin/library-tags` と作成・更新・削除、GET `/api/admin/assistants/AIModels`・`endpoints/{type}`、GET `/api/admin/tenants/endpoints/{type}`
- アシスタントの作成・更新のリクエスト（`AssistantMutationPayload`）
- POST `/api/admin/indexes/{id}/additionalLearning`（multipart）

## 4. 判断がつかなかったもの

- enum 値の突き合わせ: `ResponseStatus`（`OK`・`ERROR`・`PENDING`・`COMPLETE`・`STREAMING`）と backend の `MessageContentStatus`、ファイルの `status`、`IndexType`・`EndpointType`・`AssistantType`
- SSE（POST `/api/messages/content`）のイベント名・ペイロード（`reasoning_delta`・`text_delta`・`library_*_delta`・`message_stop`・`message_content`）
- `ApiResponse`・`ApiErrorResponse`・`TenantMismatchErrorResponse`（`api-response.type.ts`）と backend のエラー本文の形
- `UsageHistory`・`GroupListApiResponse`・`PromptTemplate`（GET `/api/prompt-templates` は移植元が `unknown` で受けて変換している）
