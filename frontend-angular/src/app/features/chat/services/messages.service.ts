import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { Message } from '@app-types/chat/message.type';
import {
  buildSendMessageTextData,
  CreateMessageApiResponse,
  mapMessageContentItemToAssistantMessage,
  mapMessageContentsToMessages,
  MESSAGE_CONTENT_WEB_SEARCH_TOOLS,
  MessageContentApiItem,
  MessageContentTextData,
  MessageListApiItem,
  MessagesListApiResponse,
  parseCreateMessageId,
} from '@app-types/chat/message-api.type';
import { FileAttachment } from '@app-types/chat/file-attachment.type';
import { parseReasoningText } from '@core/utils/reasoning-text.helpers';
import { buildFirstMessageRenameName } from '@core/utils/room-name.helpers';
import { ApiClientService } from '@core/services/api-client';
import { ToastService } from '@core/services/toast.service';
import { API_PATHS } from '@core/constants/api-paths.config';
import {
  adjustActiveVersionIndexAfterDelete,
  applyMessageMetadataToMessages,
  buildVisibleThread,
  buildVersionInfoByMessageId,
  collectDescendantRecordIds,
  getLastActiveRecordId,
  getSiblingRecords,
  getVersionInfoForUserMessage,
  initializeActiveVersionIndex,
  MessageVersionInfo,
  toMessageGroupKey,
} from '@features/chat/utils/message-thread.helpers';
import { MessageContentStreamService } from './message-content-stream.service';
import { ViewerService } from './viewer.service';

/** sendMessage の送信オプション。フラグ追加時はここに足す（位置引数を増やさない） */
export interface SendMessageOptions {
  assistantId?: string;
  parentMessageId?: string;
  useWebSearch?: boolean;
  additionalPrompt?: string;
  createLibrary?: boolean;
}
import { MessageContentsApiService } from './message-contents-api.service';
import { RoomsService } from './rooms.service';
import { AssistantsService } from './assistants.service';

export type MessageLoadError = 'forbidden' | 'general' | null;

@Injectable({
  providedIn: 'root',
})
export class MessageService {
  private _messages = signal<Message[]>([]);
  private _messageRecords = signal<MessageListApiItem[]>([]);
  private _activeVersionIndex = signal<Map<string, number>>(new Map());
  private _isLoading = signal<boolean>(false);
  private _isGenerating = signal<boolean>(false);
  private _loadError = signal<MessageLoadError>(null);

  private readonly api = inject(ApiClientService);
  private readonly messageContentStream = inject(MessageContentStreamService);
  private readonly viewerService = inject(ViewerService);
  private readonly messageContentsApi = inject(MessageContentsApiService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly roomsService = inject(RoomsService);
  private readonly assistantsService = inject(AssistantsService);
  private readonly queryClient = inject(QueryClient);

  readonly visibleMessages = computed(() =>
    buildVisibleThread(this._messageRecords(), this._messages(), this._activeVersionIndex()),
  );

  readonly versionInfoByMessageId = computed(() =>
    buildVersionInfoByMessageId(this._messageRecords(), this._activeVersionIndex()),
  );

  isLoading = this._isLoading.asReadonly();
  isGenerating = this._isGenerating.asReadonly();
  loadError = this._loadError.asReadonly();

  clearMessages(): void {
    this._messages.set([]);
    this._messageRecords.set([]);
    this._activeVersionIndex.set(new Map());
    this._isLoading.set(false);
    this._isGenerating.set(false);
    this._loadError.set(null);
  }

  async loadMessagesForRoom(roomId: string, isInit?: boolean): Promise<void> {
    if (isInit) {
      this._isLoading.set(true);
    }
    this._activeVersionIndex.set(new Map());
    this._loadError.set(null);

    try {
      const listData = await this.api.get<MessagesListApiResponse>(API_PATHS.MESSAGES.LIST, {
        params: { roomId },
      });

      const records = listData.messages ?? [];

      if (records.length === 0) {
        this._messages.set([]);
        this._messageRecords.set([]);
        return;
      }

      const assistantIdMap = new Map(records.map((m) => [m.id, m.assistantId]));
      const { contents, failures } = await this.messageContentsApi.fetchContents(listData);

      if (failures.length > 0) {
        this.notifyContentFetchFailures(failures);
      }

      const messages = applyMessageMetadataToMessages(
        mapMessageContentsToMessages(contents, assistantIdMap),
        records,
      );

      this._messageRecords.set(records);
      this._messages.set(messages);
      this._activeVersionIndex.set(initializeActiveVersionIndex(records));
    } catch (err) {
      this._messages.set([]);
      this._messageRecords.set([]);
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this._loadError.set('forbidden');
      } else {
        this._loadError.set('general');
      }
    } finally {
      this._isLoading.set(false);
    }
  }

  switchVersion(groupKey: string, direction: 'prev' | 'next'): void {
    const parentId = groupKey === toMessageGroupKey(null) ? null : groupKey;
    const siblings = getSiblingRecords(this._messageRecords(), parentId);
    if (siblings.length <= 1) {
      return;
    }

    const currentIndex = this._activeVersionIndex().get(groupKey) ?? siblings.length - 1;
    const nextIndex =
      direction === 'prev'
        ? Math.max(0, currentIndex - 1)
        : Math.min(siblings.length - 1, currentIndex + 1);

    if (nextIndex === currentIndex) {
      return;
    }

    this._activeVersionIndex.update((indexByGroup) => {
      const next = new Map(indexByGroup);
      next.set(groupKey, nextIndex);
      return next;
    });
  }

  getVersionInfo(message: Message): MessageVersionInfo | null {
    return getVersionInfoForUserMessage(
      message,
      this._messageRecords(),
      this._activeVersionIndex(),
    );
  }

  async sendMessage(
    content: string,
    files: File[] | undefined,
    roomId: string | null,
    attachedFiles: FileAttachment[],
    options?: SendMessageOptions,
  ): Promise<void> {
    if (!content.trim() && (!files || files.length === 0)) return;

    const room = roomId
      ? this.roomsService.allRooms().find((item) => item.id === roomId)
      : undefined;
    const firstMessageRenameName = buildFirstMessageRenameName({
      roomId,
      content,
      messageCount: this._messages().length,
      recordCount: this._messageRecords().length,
      roomName: room?.name,
      defaultAssistantId: room?.defaultAssistantId,
      assistants: this.assistantsService.assistantsQuery.data() ?? [],
    });

    const { assistantId, parentMessageId, useWebSearch, additionalPrompt, createLibrary } =
      options ?? {};
    const sentMetadata = {
      tools: useWebSearch ? MESSAGE_CONTENT_WEB_SEARCH_TOOLS : undefined,
      promptTemplateContent: additionalPrompt,
      isCreateLibrary: createLibrary,
    };

    const now = Date.now();
    const resolvedParentMessageId =
      parentMessageId ??
      getLastActiveRecordId(this._messageRecords(), this._messages(), this._activeVersionIndex());

    const userMessage: Message = {
      id: `msg-${now}`,
      messageId: `msg-${now}`,
      role: 'user',
      status: 'COMPLETE',
      question: content,
      answer: '',
      context: '',
      attachmentFiles: attachedFiles,
      files,
      referenceFilePaths: [],
      isRated: false,
      parentId: resolvedParentMessageId,
      // 送信直後の再生成でも assistantId を解決できるよう、楽観的メッセージにも設定する
      assistantId: assistantId ?? undefined,
      ...sentMetadata,
    };

    const pendingAssistantId = `msg-${now + 1}`;
    const pendingAssistantMessage: Message = {
      id: pendingAssistantId,
      messageId: '',
      role: 'assistant',
      status: 'PENDING',
      question: '',
      answer: '',
      context: '',
      attachmentFiles: [],
      referenceFilePaths: [],
      isRated: false,
      parentId: userMessage.messageId,
      assistantId: assistantId ?? undefined,
    };

    this._messages.update((messages) => [...messages, userMessage, pendingAssistantMessage]);
    this._isGenerating.set(true);

    // この送信が開始したライブラリストリームの世代トークン（他の送信のストリームには干渉しない）
    let libraryStreamToken: number | null = null;

    try {
      // 送信時の tools / テンプレート本文 / ライブラリ生成可否を messages に保持させる
      const payload = {
        roomId,
        assistantId: assistantId ?? null,
        parentMessageId: resolvedParentMessageId,
        messageText: content,
        ...sentMetadata,
      };
      const createResponse = await this.api.post<CreateMessageApiResponse>(
        API_PATHS.MESSAGES.CREATE,
        payload,
        { responseType: 'text' },
      );
      const createdMessageId = parseCreateMessageId(createResponse);

      this._messages.update((msgs) =>
        msgs.map((m) => {
          if (m.id === userMessage.id) {
            return { ...m, messageId: createdMessageId, id: createdMessageId };
          }
          if (m.id === pendingAssistantId) {
            return { ...m, messageId: createdMessageId, parentId: createdMessageId };
          }
          return m;
        }),
      );
      this._messageRecords.update((records) => [
        ...records,
        {
          id: createdMessageId,
          roomId: roomId ?? '',
          assistantId: assistantId ?? '',
          parentId: resolvedParentMessageId,
          isRated: false,
          ...sentMetadata,
        },
      ]);

      if (firstMessageRenameName && roomId) {
        void this.roomsService.renameRoom(roomId, firstMessageRenameName).catch(() => undefined);
      }

      const formData = this.buildMessageContentFormData({
        textData: buildSendMessageTextData({
          messageId: createdMessageId,
          userInput: content,
          assistantId,
          additionalPrompt,
          tools: sentMetadata.tools,
          createLibrary,
        }),
        attachmentFiles: files,
      });

      const baseHandlers = this.createAssistantStreamHandlers(pendingAssistantId);
      const handlers = createLibrary
        ? {
            ...baseHandlers,
            onLibraryTitleDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryTitleDelta(libraryStreamToken, text);
            },
            onLibraryContentDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryContentDelta(libraryStreamToken, text);
            },
          }
        : baseHandlers;

      await this.streamMessageContent(formData, pendingAssistantId, handlers);
    } catch {
      this._messages.update((messages) =>
        messages.map((m) => (m.id === pendingAssistantId ? { ...m, status: 'ERROR' } : m)),
      );
      if (libraryStreamToken !== null) {
        // 途中失敗: 表示をサーバー上の内容へ復元する
        void this.viewerService.abortLibraryStream(libraryStreamToken);
        libraryStreamToken = null;
      }
    } finally {
      if (libraryStreamToken !== null) {
        void this.viewerService.endLibraryStream(libraryStreamToken, roomId ?? undefined);
      }
      this._isGenerating.set(false);
    }
  }

  async regenerateMessage(messageContentId: string): Promise<void> {
    return this.resendMessage(messageContentId);
  }

  async retryMessage(messageContentId: string): Promise<void> {
    return this.resendMessage(messageContentId);
  }

  async webSearchRetryMessage(messageContentId: string): Promise<void> {
    return this.resendMessage(messageContentId, { useWebSearch: true });
  }

  async deleteMessage(messageId: string): Promise<void> {
    const recordsBeforeDelete = this._messageRecords();
    const deletedRecord = recordsBeforeDelete.find((record) => record.id === messageId);

    try {
      await this.api.delete(API_PATHS.MESSAGES.DETAIL(messageId));

      const removedRecordIds = deletedRecord
        ? collectDescendantRecordIds(recordsBeforeDelete, messageId)
        : new Set([messageId]);
      const recordsAfterDelete = recordsBeforeDelete.filter(
        (record) => !removedRecordIds.has(record.id),
      );

      this._messages.update((msgs) =>
        msgs.filter(
          (message) =>
            !removedRecordIds.has(message.messageId) && !removedRecordIds.has(message.id),
        ),
      );
      this._messageRecords.set(recordsAfterDelete);

      if (deletedRecord) {
        this._activeVersionIndex.set(
          adjustActiveVersionIndexAfterDelete(
            this._activeVersionIndex(),
            deletedRecord,
            recordsBeforeDelete,
            removedRecordIds,
            recordsAfterDelete,
          ),
        );
      }
    } catch (error) {
      console.error('Delete message failed', error);
      throw error;
    }
  }

  async rateMessage(messageId: string, rating: 'GOOD' | 'BAD'): Promise<void> {
    const previousMessages = this._messages();
    this._messages.update((msgs) =>
      msgs.map((m) => (m.messageId === messageId ? { ...m, isRated: true, rating } : m)),
    );

    try {
      await this.api.post(API_PATHS.MESSAGES.FEEDBACK(messageId), { rating });
      await this.queryClient.invalidateQueries({
        predicate: (query) => isMessageFeedbackListQuery(query.queryKey),
      });
    } catch (error) {
      this._messages.set(previousMessages);
      console.error('Rate message failed', error);
      throw error;
    }
  }

  async editMessage(messageId: string, newText: string, roomId: string | null): Promise<void> {
    if (!newText.trim()) return;

    const messages = this._messages();
    const editIndex = messages.findIndex((m) => m.id === messageId || m.messageId === messageId);
    if (editIndex === -1) return;

    const editedMessage = messages[editIndex];
    if (editedMessage.role !== 'user') return;

    const parentMessageId = editedMessage.parentId ?? null;
    const assistantId = editedMessage.assistantId;
    const groupKey = toMessageGroupKey(parentMessageId);

    const now = Date.now();
    const newUserId = `msg-${now}`;
    const pendingAssistantId = `msg-${now + 1}`;

    const newUserMessage: Message = {
      id: newUserId,
      messageId: newUserId,
      role: 'user',
      status: 'COMPLETE',
      question: newText,
      answer: '',
      context: '',
      attachmentFiles: editedMessage.attachmentFiles ?? [],
      files: editedMessage.files,
      referenceFilePaths: [],
      isRated: false,
      parentId: parentMessageId,
      assistantId,
      tools: editedMessage.tools,
      promptTemplateContent: editedMessage.promptTemplateContent,
      isCreateLibrary: editedMessage.isCreateLibrary,
    };

    const pendingAssistantMessage: Message = {
      id: pendingAssistantId,
      messageId: '',
      role: 'assistant',
      status: 'PENDING',
      question: '',
      answer: '',
      context: '',
      attachmentFiles: [],
      referenceFilePaths: [],
      isRated: false,
      parentId: newUserId,
      assistantId: assistantId ?? undefined,
    };

    const snapshot = {
      messages: this._messages(),
      messageRecords: this._messageRecords(),
      activeVersionIndex: new Map(this._activeVersionIndex()),
    };

    this._messages.update((msgs) => [...msgs, newUserMessage, pendingAssistantMessage]);
    this._isGenerating.set(true);

    // ライブラリ編集時はビューワーへストリーミングを反映する（送信・再生成と同じ挙動）
    const isLibrary = editedMessage.isCreateLibrary === true;
    let libraryStreamToken: number | null = null;

    try {
      // 元のチャットで使用した tools / テンプレート本文 / ライブラリ生成可否を messages に保持させる
      const payload = {
        roomId,
        assistantId: assistantId ?? null,
        parentMessageId,
        messageText: newText,
        tools: editedMessage.tools ?? undefined,
        promptTemplateContent: editedMessage.promptTemplateContent ?? undefined,
        isCreateLibrary: editedMessage.isCreateLibrary,
      };
      const createResponse = await this.api.post<CreateMessageApiResponse>(
        API_PATHS.MESSAGES.CREATE,
        payload,
        { responseType: 'text' },
      );
      const createdMessageId = parseCreateMessageId(createResponse);

      this._messages.update((msgs) =>
        msgs.map((m) => {
          if (m.id === newUserId) {
            return {
              ...m,
              id: createdMessageId,
              messageId: createdMessageId,
              parentId: parentMessageId,
            };
          }
          if (m.id === pendingAssistantId) {
            return { ...m, messageId: createdMessageId, parentId: createdMessageId };
          }
          return m;
        }),
      );

      this._messageRecords.update((records) => [
        ...records,
        {
          id: createdMessageId,
          roomId: roomId ?? '',
          assistantId: assistantId ?? '',
          parentId: parentMessageId,
          isRated: false,
          tools: editedMessage.tools,
          promptTemplateContent: editedMessage.promptTemplateContent,
          isCreateLibrary: editedMessage.isCreateLibrary,
        },
      ]);

      const siblings = getSiblingRecords(this._messageRecords(), parentMessageId);
      this._activeVersionIndex.update((indexByGroup) => {
        const next = new Map(indexByGroup);
        next.set(groupKey, siblings.length - 1);
        return next;
      });

      const formData = this.buildMessageContentFormData({
        textData: buildSendMessageTextData({
          messageId: createdMessageId,
          userInput: newText,
          assistantId,
          // 元のチャットで使用したツール・テンプレート・ライブラリ生成設定を再利用する
          tools: editedMessage.tools ?? undefined,
          additionalPrompt: editedMessage.promptTemplateContent ?? undefined,
          createLibrary: editedMessage.isCreateLibrary,
        }),
      });

      const baseHandlers = this.createAssistantStreamHandlers(pendingAssistantId);
      const handlers = isLibrary
        ? {
            ...baseHandlers,
            onLibraryTitleDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryTitleDelta(libraryStreamToken, text);
            },
            onLibraryContentDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryContentDelta(libraryStreamToken, text);
            },
          }
        : baseHandlers;

      await this.streamMessageContent(formData, pendingAssistantId, handlers);
    } catch {
      this._messages.set(snapshot.messages);
      this._messageRecords.set(snapshot.messageRecords);
      this._activeVersionIndex.set(snapshot.activeVersionIndex);
      if (libraryStreamToken !== null) {
        // 途中失敗: 表示をサーバー上の内容へ復元する
        void this.viewerService.abortLibraryStream(libraryStreamToken);
        libraryStreamToken = null;
      }
    } finally {
      if (libraryStreamToken !== null) {
        void this.viewerService.endLibraryStream(libraryStreamToken, roomId ?? undefined);
      }
      this._isGenerating.set(false);
    }
  }

  private async resendMessage(
    messageContentId: string,
    options?: { useWebSearch?: boolean },
  ): Promise<void> {
    const textData = this.buildResendMessageTextData(messageContentId, options);
    if (!textData) {
      return;
    }

    this._messages.update((msgs) =>
      msgs.map((m) =>
        m.id === messageContentId
          ? { ...m, status: 'PENDING', answer: '', reasoning: undefined }
          : m,
      ),
    );
    this._isGenerating.set(true);

    // ライブラリ再生成時はビューワーへストリーミングを反映する（送信時と同じ挙動）
    const isLibrary = textData.createLibrary === true;
    const target = this._messages().find((m) => m.id === messageContentId);
    const roomId = this._messageRecords().find((r) => r.id === target?.messageId)?.roomId ?? null;
    let libraryStreamToken: number | null = null;

    try {
      const formData = this.buildMessageContentFormData({ textData });

      const baseHandlers = this.createAssistantStreamHandlers(messageContentId);
      const handlers = isLibrary
        ? {
            ...baseHandlers,
            onLibraryTitleDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryTitleDelta(libraryStreamToken, text);
            },
            onLibraryContentDelta: (text: string) => {
              libraryStreamToken ??= this.viewerService.beginLibraryStream(roomId);
              this.viewerService.appendLibraryContentDelta(libraryStreamToken, text);
            },
          }
        : baseHandlers;

      await this.streamMessageContent(formData, messageContentId, handlers);
    } catch {
      this._messages.update((msgs) =>
        msgs.map((m) => (m.id === messageContentId ? { ...m, status: 'ERROR' } : m)),
      );
      if (libraryStreamToken !== null) {
        // 途中失敗: 表示をサーバー上の内容へ復元する
        void this.viewerService.abortLibraryStream(libraryStreamToken);
        libraryStreamToken = null;
      }
    } finally {
      if (libraryStreamToken !== null) {
        void this.viewerService.endLibraryStream(libraryStreamToken, roomId ?? undefined);
      }
      this._isGenerating.set(false);
    }
  }

  private createAssistantStreamHandlers(initialLocalMessageId: string): {
    onReasoningDelta: (text: string) => void;
    onTextDelta: (text: string) => void;
    onMessageContent: (item: MessageContentApiItem) => void;
  } {
    let trackedMessageId = initialLocalMessageId;
    let streamedText = '';
    let streamedReasoning = '';

    const patchAssistant = (patch: Partial<Message>): void => {
      this.patchAssistantMessage(trackedMessageId, patch);
      if (patch.id && patch.id !== trackedMessageId) {
        trackedMessageId = patch.id;
      }
    };

    return {
      onReasoningDelta: (text) => {
        streamedReasoning += text;
        patchAssistant({
          reasoning: parseReasoningText(streamedReasoning),
        });
      },
      onTextDelta: (text) => {
        streamedText += text;
        patchAssistant({
          status: 'STREAMING',
          answer: streamedText,
        });
      },
      onMessageContent: (item) => {
        patchAssistant(mapMessageContentItemToAssistantMessage(item, trackedMessageId));
      },
    };
  }

  private buildResendMessageTextData(
    messageContentId: string,
    options?: { useWebSearch?: boolean },
  ): MessageContentTextData | null {
    const messages = this._messages();
    const target = messages.find((m) => m.id === messageContentId);
    if (!target?.messageId) {
      return null;
    }

    const userMessage = messages.find((m) => m.role === 'user' && m.messageId === target.messageId);
    const userInput = userMessage?.question?.trim() ?? '';
    if (!userInput) {
      return null;
    }

    // 「web検索を利用して再回答」は従来どおり web_search のみで再送する（テンプレート・ライブラリは付与しない）
    if (options?.useWebSearch) {
      return buildSendMessageTextData({
        messageId: target.messageId,
        userInput,
        assistantId: target.assistantId ?? userMessage?.assistantId,
        messageContentId,
        tools: MESSAGE_CONTENT_WEB_SEARCH_TOOLS,
      });
    }

    // 通常の再生成では元のチャットで使用したツール・テンプレート・ライブラリ生成設定を再利用する
    // （メタデータは同一 messageId の user/assistant 両メッセージに伝播済み）
    return buildSendMessageTextData({
      messageId: target.messageId,
      userInput,
      assistantId: target.assistantId ?? userMessage?.assistantId,
      messageContentId,
      tools: target.tools ?? userMessage?.tools ?? undefined,
      additionalPrompt:
        target.promptTemplateContent ?? userMessage?.promptTemplateContent ?? undefined,
      createLibrary: target.isCreateLibrary ?? userMessage?.isCreateLibrary,
    });
  }

  private buildMessageContentFormData(options: {
    textData: MessageContentTextData;
    attachmentFiles?: File[];
    historyAttachmentFiles?: File[];
  }): FormData {
    const formData = new FormData();
    formData.append(
      'textData',
      new Blob([JSON.stringify(options.textData)], { type: 'application/json' }),
    );

    for (const file of options.attachmentFiles ?? []) {
      formData.append('attachmentFiles', file);
    }
    for (const file of options.historyAttachmentFiles ?? []) {
      formData.append('historyAttachmentFiles', file);
    }

    return formData;
  }

  private streamMessageContent(
    formData: FormData,
    localMessageId: string,
    handlers: {
      onReasoningDelta?: (text: string) => void;
      onTextDelta: (text: string) => void;
      onLibraryTitleDelta?: (text: string) => void;
      onLibraryContentDelta?: (text: string) => void;
      onMessageContent: (item: MessageContentApiItem) => void;
    },
  ): Promise<Message> {
    return this.messageContentStream.streamMessageContent(formData, localMessageId, handlers);
  }

  private patchAssistantMessage(localId: string, patch: Partial<Message>): void {
    this._messages.update((messages) =>
      messages.map((m) => (m.id === localId ? { ...m, ...patch } : m)),
    );
  }

  private notifyContentFetchFailures(failures: { reason: string }[]): void {
    const hasInvalidEndpoint = failures.some((failure) =>
      ['no_endpoint', 'missing_destination', 'missing_api_key', 'assistant_not_found'].includes(
        failure.reason,
      ),
    );
    const hasFetchFailed = failures.some((failure) => failure.reason === 'fetch_failed');

    if (hasInvalidEndpoint) {
      this.toast.warning(this.translate.instant('CHAT.MESSAGES.LOCAL_ENDPOINT_INVALID'));
    }
    if (hasFetchFailed) {
      this.toast.warning(this.translate.instant('CHAT.MESSAGES.LOCAL_FETCH_FAILED'));
    }
    if (!hasInvalidEndpoint && !hasFetchFailed) {
      this.toast.warning(this.translate.instant('CHAT.MESSAGES.PARTIAL_LOAD_FAILED'));
    }
  }
}

function isMessageFeedbackListQuery(queryKey: readonly unknown[]): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'feedback' &&
    (queryKey[1] === 'accuracy' || queryKey[1] === 'users')
  );
}
