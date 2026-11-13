import i18next from 'i18next';
import { create } from 'zustand';
import { useMemo } from 'react';
import { ApiError, apiClient, resolveTenantId } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { getLibraryStreamBridge } from '@/lib/chat/library-stream-bridge';
import { getAccessTokenForLocalContent } from '@/lib/chat/local-content-token';
import { buildHistoryMessagesFromVisibleThread } from '@/lib/chat/message-history';
import {
  resolveAssistantEndpoint,
  resolveAssistantModel,
} from '@/lib/chat/message-content-endpoint';
import { fetchMessageContents, type ContentFetchFailure } from '@/lib/chat/message-contents-api';
import { streamMessageContent, type ContentStreamTarget } from '@/lib/chat/message-content-stream';
import {
  adjustActiveVersionIndexAfterDelete,
  applyMessageMetadataToMessages,
  buildVersionInfoByMessageId,
  buildVisibleThread,
  collectDescendantRecordIds,
  getLastActiveRecordId,
  getSiblingRecords,
  getVersionInfoForUserMessage,
  initializeActiveVersionIndex,
  toMessageGroupKey,
  type MessageVersionInfo,
} from '@/lib/chat/message-thread';
import { parseReasoningText } from '@/lib/utils/reasoning-text';
import { buildFirstMessageRenameName } from '@/lib/utils/room-name';
import { useToastStore } from '@/components/shared/toast-store';
import { useRoomsStore } from '@/store/rooms-store';
import type { Assistant } from '@/types/chat/assistant.type';
import type { FileAttachment } from '@/types/chat/file-attachment.type';
import {
  buildSendMessageTextData,
  mapMessageContentItemToAssistantMessage,
  mapMessageContentsToMessages,
  MESSAGE_CONTENT_WEB_SEARCH_TOOLS,
  parseCreateMessageId,
  type CreateMessageApiResponse,
  type MessageContentApiItem,
  type MessageContentTextData,
  type MessageListApiItem,
  type MessageListAssistant,
  type MessagesListApiResponse,
} from '@/types/chat/message-api.type';
import type { MessageContentStreamHandlers } from '@/types/chat/message-content-stream.type';
import type { Message, MessageFeedbackRating } from '@/types/chat/message.type';

/** sendMessage の送信オプション。フラグ追加時はここに足す（位置引数を増やさない） */
export interface SendMessageOptions {
  assistantId?: string;
  parentMessageId?: string;
  useWebSearch?: boolean;
  additionalPrompt?: string;
  createLibrary?: boolean;
}

export type MessageLoadError = 'forbidden' | 'general' | null;

const HTTP_FORBIDDEN = 403;

/**
 * 最新の読み込みの連番。ルームを切り替えたあとに、遅れて届いた前のルームの応答が state を上書きしないよう、
 * 古い連番の応答は捨てる（移植元にはない。`clearMessages` でも進める）。
 */
let loadSequence = 0;

/** 本文取得の失敗理由のうち、ローカルサーバーの接続情報の不備にあたるもの */
const INVALID_ENDPOINT_REASONS = [
  'no_endpoint',
  'missing_destination',
  'missing_api_key',
  'assistant_not_found',
];

interface MessagesState {
  /** 全バージョンのメッセージ（編集・再生成で増える）。表示するのは `useVisibleMessages` */
  messages: Message[];
  /** GET /api/messages の各メッセージの親子関係。バージョン切り替えの元 */
  messageRecords: MessageListApiItem[];
  /** 部屋で使ったアシスタントの情報（SECURE の接続先など） */
  assistants: MessageListAssistant[];
  /** 兄弟メッセージ（同じ親）のうち表示中のもの。キーは `toMessageGroupKey(parentId)` */
  activeVersionIndex: Map<string, number>;
  isLoading: boolean;
  isGenerating: boolean;
  loadError: MessageLoadError;
  /**
   * アシスタント一覧（`useAssistants`）。ルーム名の自動変更と SECURE の model の取得に使う。
   * store は query cache を読めないため、`useChatActions` が一覧の更新のたびに入れる。
   */
  assistantCatalog: Assistant[];
}

interface MessagesActions {
  setAssistantCatalog: (assistants: Assistant[]) => void;
  clearMessages: () => void;
  loadMessagesForRoom: (roomId: string, isInit?: boolean) => Promise<void>;
  switchVersion: (groupKey: string, direction: 'prev' | 'next') => void;
  getVersionInfo: (message: Message) => MessageVersionInfo | null;
  sendMessage: (
    content: string,
    files: File[] | undefined,
    roomId: string | null,
    attachedFiles: FileAttachment[],
    options?: SendMessageOptions,
  ) => Promise<void>;
  regenerateMessage: (messageContentId: string) => Promise<void>;
  retryMessage: (messageContentId: string) => Promise<void>;
  webSearchRetryMessage: (messageContentId: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  /** 評価を送る。フィードバック一覧の再取得は呼び出し側（`useChatActions`）が行う */
  rateMessage: (messageId: string, rating: MessageFeedbackRating) => Promise<void>;
  editMessage: (messageId: string, newText: string, roomId: string | null) => Promise<void>;
}

export type MessagesStore = MessagesState & MessagesActions;

const INITIAL_STATE: MessagesState = {
  messages: [],
  messageRecords: [],
  assistants: [],
  activeVersionIndex: new Map(),
  isLoading: false,
  isGenerating: false,
  loadError: null,
  assistantCatalog: [],
};

interface StreamContext {
  textData: MessageContentTextData;
  target: ContentStreamTarget;
}

/** stream の途中で渡すハンドラー（ライブラリ生成中はビューワーへの通知も付く） */
type AssistantStreamHandlers = Required<
  Pick<MessageContentStreamHandlers, 'onReasoningDelta' | 'onTextDelta' | 'onMessageContent'>
> &
  Pick<MessageContentStreamHandlers, 'onLibraryTitleDelta' | 'onLibraryContentDelta'>;

function buildMessageContentFormData(options: {
  textData: MessageContentTextData;
  attachmentFiles?: File[];
}): FormData {
  const formData = new FormData();
  formData.append(
    'textData',
    new Blob([JSON.stringify(options.textData)], { type: 'application/json' }),
  );
  for (const file of options.attachmentFiles ?? []) {
    formData.append('attachmentFiles', file);
  }
  return formData;
}

/** ライブラリ生成を「いま進行中のストリーム」としてビューワーへ流す。開始・途中失敗・終了を 1 か所で扱う */
function createLibraryStreamSession(roomId: string | null) {
  let token: number | null = null;
  const bridge = getLibraryStreamBridge();

  const ensureToken = (): number | null => {
    if (!bridge) return null;
    token ??= bridge.beginLibraryStream(roomId);
    return token;
  };

  return {
    handlers: {
      onLibraryTitleDelta: (text: string) => {
        const current = ensureToken();
        if (current !== null) bridge?.appendLibraryTitleDelta(current, text);
      },
      onLibraryContentDelta: (text: string) => {
        const current = ensureToken();
        if (current !== null) bridge?.appendLibraryContentDelta(current, text);
      },
    },
    /** 途中で失敗したとき。表示をサーバー上の内容へ復元する */
    abort: () => {
      if (token !== null) {
        void bridge?.abortLibraryStream(token);
        token = null;
      }
    },
    /** ストリームが終わったとき（abort 済みなら何もしない） */
    end: () => {
      if (token !== null) {
        void bridge?.endLibraryStream(token, roomId ?? undefined);
      }
    },
  };
}

function notifyContentFetchFailures(failures: ContentFetchFailure[]): void {
  const toast = useToastStore.getState();
  const hasInvalidEndpoint = failures.some((failure) =>
    INVALID_ENDPOINT_REASONS.includes(failure.reason),
  );
  const hasFetchFailed = failures.some((failure) => failure.reason === 'fetch_failed');

  if (hasInvalidEndpoint) {
    toast.warning(i18next.t('CHAT.MESSAGES.LOCAL_ENDPOINT_INVALID'));
  }
  if (hasFetchFailed) {
    toast.warning(i18next.t('CHAT.MESSAGES.LOCAL_FETCH_FAILED'));
  }
  if (!hasInvalidEndpoint && !hasFetchFailed) {
    toast.warning(i18next.t('CHAT.MESSAGES.PARTIAL_LOAD_FAILED'));
  }
}

/** 楽観的に追加する「ユーザーの発言」と「回答待ちの assistant」を作る */
function buildPendingTurn(params: {
  now: number;
  userMessage: Omit<Message, 'id' | 'messageId' | 'role' | 'status' | 'answer' | 'context' | 'referenceFilePaths' | 'isRated'>;
  assistantId?: string;
}): { userMessage: Message; pendingAssistant: Message } {
  const userId = `msg-${params.now}`;
  const userMessage: Message = {
    id: userId,
    messageId: userId,
    role: 'user',
    status: 'COMPLETE',
    answer: '',
    context: '',
    referenceFilePaths: [],
    isRated: false,
    ...params.userMessage,
  };
  const pendingAssistant: Message = {
    id: `msg-${params.now + 1}`,
    messageId: '',
    role: 'assistant',
    status: 'PENDING',
    question: '',
    answer: '',
    context: '',
    attachmentFiles: [],
    referenceFilePaths: [],
    isRated: false,
    parentId: userId,
    assistantId: params.assistantId,
  };
  return { userMessage, pendingAssistant };
}

/**
 * 移植元 MessageService（features/chat/services/messages.service.ts）。チャット画面のメッセージ一覧・バージョン切り替え・
 * 送信（SSE でストリーミング）・再生成・編集・削除・評価。送信中は 1 文字ずつ更新されるため、store で持つ。
 */
export const useMessagesStore = create<MessagesStore>((set, get) => {
  const patchMessages = (updater: (messages: Message[]) => Message[]) =>
    set((state) => ({ messages: updater(state.messages) }));

  const patchAssistantMessage = (localId: string, patch: Partial<Message>) =>
    patchMessages((messages) => messages.map((m) => (m.id === localId ? { ...m, ...patch } : m)));

  const setActiveVersion = (groupKey: string, index: number) =>
    set((state) => {
      const next = new Map(state.activeVersionIndex);
      next.set(groupKey, index);
      return { activeVersionIndex: next };
    });

  const visibleMessages = (): Message[] => {
    const { messageRecords, messages, activeVersionIndex } = get();
    return buildVisibleThread(messageRecords, messages, activeVersionIndex);
  };

  /** stream のイベントを assistant メッセージへ反映するハンドラー。message_content で id が確定したら以降はその id を追う */
  const createAssistantStreamHandlers = (initialLocalMessageId: string): AssistantStreamHandlers => {
    let trackedMessageId = initialLocalMessageId;
    let streamedText = '';
    let streamedReasoning = '';

    const patch = (partial: Partial<Message>) => {
      patchAssistantMessage(trackedMessageId, partial);
      if (partial.id && partial.id !== trackedMessageId) {
        trackedMessageId = partial.id;
      }
    };

    return {
      onReasoningDelta: (text) => {
        streamedReasoning += text;
        patch({ reasoning: parseReasoningText(streamedReasoning) });
      },
      onTextDelta: (text) => {
        streamedText += text;
        patch({ status: 'STREAMING', answer: streamedText });
      },
      onMessageContent: (item: MessageContentApiItem) => {
        patch(mapMessageContentItemToAssistantMessage(item, trackedMessageId));
      },
    };
  };

  const handleStreamPrepFailure = (
    pendingAssistantId: string,
    reason: 'invalid_endpoint' | 'fetch_failed' = 'invalid_endpoint',
  ) => {
    const toast = useToastStore.getState();
    toast.warning(
      i18next.t(
        reason === 'fetch_failed'
          ? 'CHAT.MESSAGES.LOCAL_FETCH_FAILED'
          : 'CHAT.MESSAGES.LOCAL_ENDPOINT_INVALID',
      ),
    );
    patchAssistantMessage(pendingAssistantId, { status: 'ERROR' });
  };

  const refreshAssistantsFromRoom = async (roomId: string) => {
    const listData = await apiClient.get<MessagesListApiResponse>(API_PATHS.MESSAGES.LIST, {
      params: { roomId },
    });
    mergeAssistants(listData.assistants ?? []);
  };

  const mergeAssistants = (assistants: MessageListAssistant[]) => {
    if (assistants.length === 0) return;
    set({ assistants });
  };

  const findAssistant = (assistantId: string) =>
    get().assistants.find((assistant) => assistant.id === assistantId);

  const ensureAssistantAvailable = async (roomId: string | null, assistantId: string) => {
    const cached = findAssistant(assistantId);
    if (cached || !roomId) return cached;

    await refreshAssistantsFromRoom(roomId);
    return findAssistant(assistantId);
  };

  /** SECURE の model。エンドポイントに無ければアシスタント一覧の model を使う */
  const resolveSecureContentModel = (assistant: MessageListAssistant, assistantId: string) =>
    resolveAssistantModel(assistant) ||
    get()
      .assistantCatalog.find((item) => item.id === assistantId)
      ?.model?.trim() ||
    undefined;

  /**
   * 送信先と textData を決める。SECURE アシスタントはローカルサーバー宛てに組み直す（接続情報が不正なら null を返し、回答を ERROR にする）。
   * 会話履歴を送る設定（includeHistory）のアシスタントには、表示中スレッドから履歴を付ける。
   */
  const prepareSecureStreamContext = async (options: {
    assistantId?: string;
    roomId: string | null;
    pendingAssistantId: string;
    excludeMessageId: string;
    textData: MessageContentTextData;
  }): Promise<StreamContext | null> => {
    if (!options.assistantId) {
      return { textData: options.textData, target: { kind: 'naw' } };
    }

    const assistant = await ensureAssistantAvailable(options.roomId, options.assistantId);
    if (!assistant) {
      return { textData: options.textData, target: { kind: 'naw' } };
    }

    let textDataWithHistory = options.textData;
    if (assistant.includeHistory) {
      const historyMessages = buildHistoryMessagesFromVisibleThread(
        visibleMessages(),
        options.excludeMessageId,
      );
      if (historyMessages.length > 0) {
        textDataWithHistory = { ...options.textData, historyMessages };
      }
    }

    const resolved = resolveAssistantEndpoint(assistant);
    if (resolved.kind === 'invalid') {
      handleStreamPrepFailure(options.pendingAssistantId);
      return null;
    }
    if (resolved.kind === 'naw') {
      return { textData: textDataWithHistory, target: { kind: 'naw' } };
    }

    try {
      const accessToken = await getAccessTokenForLocalContent();
      const textDataWithoutAssistantId = { ...textDataWithHistory };
      delete textDataWithoutAssistantId.assistantId;
      const model = resolveSecureContentModel(assistant, options.assistantId);
      return {
        textData: {
          ...textDataWithoutAssistantId,
          ...(model ? { assistantId: model } : {}),
          accessToken,
          tenantId: resolveTenantId() || undefined,
        },
        target: { kind: 'local', contentUrl: resolved.contentUrl, apiKey: resolved.apiKey },
      };
    } catch {
      handleStreamPrepFailure(options.pendingAssistantId, 'fetch_failed');
      return null;
    }
  };

  const buildResendMessageTextData = (
    messageContentId: string,
    options?: { useWebSearch?: boolean },
  ): MessageContentTextData | null => {
    const { messages } = get();
    const target = messages.find((m) => m.id === messageContentId);
    if (!target?.messageId) return null;

    const userMessage = messages.find((m) => m.role === 'user' && m.messageId === target.messageId);
    const userInput = userMessage?.question?.trim() ?? '';
    if (!userInput) return null;

    // 「web検索を利用して再回答」は web_search のみで再送する（テンプレート・ライブラリは付与しない）
    if (options?.useWebSearch) {
      return buildSendMessageTextData({
        messageId: target.messageId,
        userInput,
        assistantId: target.assistantId ?? userMessage?.assistantId,
        messageContentId,
        tools: MESSAGE_CONTENT_WEB_SEARCH_TOOLS,
      });
    }

    // 通常の再生成では、元のチャットのツール・テンプレート・ライブラリ生成設定を再利用する
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
  };

  const resendMessage = async (messageContentId: string, options?: { useWebSearch?: boolean }) => {
    const textData = buildResendMessageTextData(messageContentId, options);
    if (!textData) return;

    patchMessages((msgs) =>
      msgs.map((m) =>
        m.id === messageContentId
          ? { ...m, status: 'PENDING', answer: '', reasoning: undefined }
          : m,
      ),
    );
    set({ isGenerating: true });

    // ライブラリ再生成時はビューワーへストリーミングを反映する（送信時と同じ挙動）
    const isLibrary = textData.createLibrary === true;
    const target = get().messages.find((m) => m.id === messageContentId);
    const roomId =
      get().messageRecords.find((r) => r.id === target?.messageId)?.roomId ?? null;
    const library = createLibraryStreamSession(roomId);

    try {
      const streamContext = await prepareSecureStreamContext({
        assistantId: textData.assistantId,
        roomId,
        pendingAssistantId: messageContentId,
        excludeMessageId: textData.messageId,
        textData,
      });
      if (!streamContext) return;

      const baseHandlers = createAssistantStreamHandlers(messageContentId);
      await streamMessageContent(
        buildMessageContentFormData({ textData: streamContext.textData }),
        messageContentId,
        isLibrary ? { ...baseHandlers, ...library.handlers } : baseHandlers,
        streamContext.target,
      );
    } catch (error) {
      console.error('Resend message failed', error);
      patchMessages((msgs) =>
        msgs.map((m) => (m.id === messageContentId ? { ...m, status: 'ERROR' } : m)),
      );
      library.abort();
    } finally {
      library.end();
      set({ isGenerating: false });
    }
  };

  return {
    ...INITIAL_STATE,

    setAssistantCatalog: (assistants) => set({ assistantCatalog: assistants }),

    clearMessages: () => {
      loadSequence += 1;
      set({
        messages: [],
        messageRecords: [],
        assistants: [],
        activeVersionIndex: new Map(),
        isLoading: false,
        isGenerating: false,
        loadError: null,
      });
    },

    loadMessagesForRoom: async (roomId, isInit) => {
      const sequence = ++loadSequence;
      const isStale = () => sequence !== loadSequence;
      if (isInit) {
        set({ isLoading: true });
      }
      set({ activeVersionIndex: new Map(), loadError: null });

      try {
        const listData = await apiClient.get<MessagesListApiResponse>(API_PATHS.MESSAGES.LIST, {
          params: { roomId },
        });
        if (isStale()) return;

        mergeAssistants(listData.assistants ?? []);

        const records = listData.messages ?? [];
        if (records.length === 0) {
          set({ messages: [], messageRecords: [] });
          return;
        }

        const assistantIdMap = new Map(records.map((m) => [m.id, m.assistantId]));
        const { contents, failures } = await fetchMessageContents(listData);
        if (isStale()) return;

        if (failures.length > 0) {
          notifyContentFetchFailures(failures);
        }

        const messages = applyMessageMetadataToMessages(
          mapMessageContentsToMessages(contents, assistantIdMap),
          records,
        );

        set({
          messageRecords: records,
          messages,
          activeVersionIndex: initializeActiveVersionIndex(records),
        });
      } catch (err) {
        if (isStale()) return;
        set({
          messages: [],
          messageRecords: [],
          loadError: err instanceof ApiError && err.status === HTTP_FORBIDDEN ? 'forbidden' : 'general',
        });
      } finally {
        if (!isStale()) set({ isLoading: false });
      }
    },

    switchVersion: (groupKey, direction) => {
      const parentId = groupKey === toMessageGroupKey(null) ? null : groupKey;
      const siblings = getSiblingRecords(get().messageRecords, parentId);
      if (siblings.length <= 1) return;

      const currentIndex = get().activeVersionIndex.get(groupKey) ?? siblings.length - 1;
      const nextIndex =
        direction === 'prev'
          ? Math.max(0, currentIndex - 1)
          : Math.min(siblings.length - 1, currentIndex + 1);
      if (nextIndex === currentIndex) return;

      setActiveVersion(groupKey, nextIndex);
    },

    getVersionInfo: (message) =>
      getVersionInfoForUserMessage(message, get().messageRecords, get().activeVersionIndex),

    sendMessage: async (content, files, roomId, attachedFiles, options) => {
      if (!content.trim() && (!files || files.length === 0)) return;

      const room = roomId
        ? useRoomsStore.getState().allRooms.find((item) => item.id === roomId)
        : undefined;
      const firstMessageRenameName = buildFirstMessageRenameName({
        roomId,
        content,
        messageCount: get().messages.length,
        recordCount: get().messageRecords.length,
        roomName: room?.name,
        defaultAssistantId: room?.defaultAssistantId,
        assistants: get().assistantCatalog,
      });

      const { assistantId, parentMessageId, useWebSearch, additionalPrompt, createLibrary } =
        options ?? {};
      const sentMetadata = {
        tools: useWebSearch ? MESSAGE_CONTENT_WEB_SEARCH_TOOLS : undefined,
        promptTemplateContent: additionalPrompt,
        isCreateLibrary: createLibrary,
      };

      const resolvedParentMessageId =
        parentMessageId ??
        getLastActiveRecordId(get().messageRecords, get().messages, get().activeVersionIndex);

      const { userMessage, pendingAssistant } = buildPendingTurn({
        now: Date.now(),
        assistantId,
        userMessage: {
          question: content,
          attachmentFiles: attachedFiles,
          files,
          parentId: resolvedParentMessageId,
          // 送信直後の再生成でも assistantId を解決できるよう、楽観的メッセージにも設定する
          assistantId: assistantId ?? undefined,
          ...sentMetadata,
        },
      });
      const pendingAssistantId = pendingAssistant.id;

      patchMessages((messages) => [...messages, userMessage, pendingAssistant]);
      set({ isGenerating: true });

      const library = createLibraryStreamSession(roomId);

      try {
        // 送信時の tools / テンプレート本文 / ライブラリ生成可否を messages に保持させる
        const createResponse = await apiClient.post<CreateMessageApiResponse>(
          API_PATHS.MESSAGES.CREATE,
          {
            roomId,
            assistantId: assistantId ?? null,
            parentMessageId: resolvedParentMessageId,
            messageText: content,
            ...sentMetadata,
          },
          { responseType: 'text' },
        );
        const createdMessageId = parseCreateMessageId(createResponse);

        patchMessages((msgs) =>
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
        set((state) => ({
          messageRecords: [
            ...state.messageRecords,
            {
              id: createdMessageId,
              roomId: roomId ?? '',
              assistantId: assistantId ?? '',
              parentId: resolvedParentMessageId,
              isRated: false,
              ...sentMetadata,
            },
          ],
        }));

        if (firstMessageRenameName && roomId) {
          // 名前の自動変更に失敗しても送信は続ける
          void useRoomsStore
            .getState()
            .renameRoom(roomId, firstMessageRenameName)
            .catch((error: unknown) => console.warn('Rename room failed', error));
        }

        const streamContext = await prepareSecureStreamContext({
          assistantId,
          roomId,
          pendingAssistantId,
          excludeMessageId: createdMessageId,
          textData: buildSendMessageTextData({
            messageId: createdMessageId,
            userInput: content,
            assistantId,
            additionalPrompt,
            tools: sentMetadata.tools,
            createLibrary,
          }),
        });
        if (!streamContext) return;

        const baseHandlers = createAssistantStreamHandlers(pendingAssistantId);
        await streamMessageContent(
          buildMessageContentFormData({ textData: streamContext.textData, attachmentFiles: files }),
          pendingAssistantId,
          createLibrary ? { ...baseHandlers, ...library.handlers } : baseHandlers,
          streamContext.target,
        );
      } catch (error) {
        console.error('Send message failed', error);
        patchMessages((messages) =>
          messages.map((m) => (m.id === pendingAssistantId ? { ...m, status: 'ERROR' } : m)),
        );
        library.abort();
      } finally {
        library.end();
        set({ isGenerating: false });
      }
    },

    regenerateMessage: (messageContentId) => resendMessage(messageContentId),
    retryMessage: (messageContentId) => resendMessage(messageContentId),
    webSearchRetryMessage: (messageContentId) =>
      resendMessage(messageContentId, { useWebSearch: true }),

    deleteMessage: async (messageId) => {
      const recordsBeforeDelete = get().messageRecords;
      const deletedRecord = recordsBeforeDelete.find((record) => record.id === messageId);

      try {
        await apiClient.delete(API_PATHS.MESSAGES.DETAIL(messageId));

        const removedRecordIds = deletedRecord
          ? collectDescendantRecordIds(recordsBeforeDelete, messageId)
          : new Set([messageId]);
        const recordsAfterDelete = recordsBeforeDelete.filter(
          (record) => !removedRecordIds.has(record.id),
        );

        patchMessages((msgs) =>
          msgs.filter(
            (message) =>
              !removedRecordIds.has(message.messageId) && !removedRecordIds.has(message.id),
          ),
        );
        set({ messageRecords: recordsAfterDelete });

        if (deletedRecord) {
          set({
            activeVersionIndex: adjustActiveVersionIndexAfterDelete(
              get().activeVersionIndex,
              deletedRecord,
              recordsBeforeDelete,
              removedRecordIds,
              recordsAfterDelete,
            ),
          });
        }
      } catch (error) {
        console.error('Delete message failed', error);
        throw error;
      }
    },

    rateMessage: async (messageId, rating) => {
      const previousMessages = get().messages;
      const previousRecords = get().messageRecords;
      // 先に画面へ反映し、失敗したら元に戻す
      patchMessages((msgs) =>
        msgs.map((m) => (m.messageId === messageId ? { ...m, isRated: true, rating } : m)),
      );
      set((state) => ({
        messageRecords: state.messageRecords.map((r) =>
          r.id === messageId ? { ...r, isRated: true, rating } : r,
        ),
      }));

      try {
        await apiClient.post(API_PATHS.MESSAGES.FEEDBACK(messageId), { rating });
      } catch (error) {
        set({ messages: previousMessages, messageRecords: previousRecords });
        console.error('Rate message failed', error);
        throw error;
      }
    },

    editMessage: async (messageId, newText, roomId) => {
      if (!newText.trim()) return;

      const editIndex = get().messages.findIndex(
        (m) => m.id === messageId || m.messageId === messageId,
      );
      if (editIndex === -1) return;

      const editedMessage = get().messages[editIndex];
      if (editedMessage.role !== 'user') return;

      const parentMessageId = editedMessage.parentId ?? null;
      const assistantId = editedMessage.assistantId;
      const groupKey = toMessageGroupKey(parentMessageId);

      const { userMessage: newUserMessage, pendingAssistant } = buildPendingTurn({
        now: Date.now(),
        assistantId,
        userMessage: {
          question: newText,
          attachmentFiles: editedMessage.attachmentFiles ?? [],
          files: editedMessage.files,
          parentId: parentMessageId,
          assistantId,
          tools: editedMessage.tools,
          promptTemplateContent: editedMessage.promptTemplateContent,
          isCreateLibrary: editedMessage.isCreateLibrary,
        },
      });
      const newUserId = newUserMessage.id;
      const pendingAssistantId = pendingAssistant.id;

      // 失敗したときに元へ戻すための控え
      const snapshot = {
        messages: get().messages,
        messageRecords: get().messageRecords,
        activeVersionIndex: new Map(get().activeVersionIndex),
      };

      patchMessages((msgs) => [...msgs, newUserMessage, pendingAssistant]);
      set({ isGenerating: true });

      // ライブラリ編集時はビューワーへストリーミングを反映する（送信・再生成と同じ挙動）
      const isLibrary = editedMessage.isCreateLibrary === true;
      const library = createLibraryStreamSession(roomId);
      const restore = () => set({ ...snapshot });

      try {
        // 元のチャットで使用した tools / テンプレート本文 / ライブラリ生成可否を messages に保持させる
        const createResponse = await apiClient.post<CreateMessageApiResponse>(
          API_PATHS.MESSAGES.CREATE,
          {
            roomId,
            assistantId: assistantId ?? null,
            parentMessageId,
            messageText: newText,
            tools: editedMessage.tools ?? undefined,
            promptTemplateContent: editedMessage.promptTemplateContent ?? undefined,
            isCreateLibrary: editedMessage.isCreateLibrary,
          },
          { responseType: 'text' },
        );
        const createdMessageId = parseCreateMessageId(createResponse);

        patchMessages((msgs) =>
          msgs.map((m) => {
            if (m.id === newUserId) {
              return { ...m, id: createdMessageId, messageId: createdMessageId, parentId: parentMessageId };
            }
            if (m.id === pendingAssistantId) {
              return { ...m, messageId: createdMessageId, parentId: createdMessageId };
            }
            return m;
          }),
        );
        set((state) => ({
          messageRecords: [
            ...state.messageRecords,
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
          ],
        }));

        // 編集で増えた新しい版を表示する
        const siblings = getSiblingRecords(get().messageRecords, parentMessageId);
        setActiveVersion(groupKey, siblings.length - 1);

        const streamContext = await prepareSecureStreamContext({
          assistantId,
          roomId,
          pendingAssistantId,
          excludeMessageId: createdMessageId,
          textData: buildSendMessageTextData({
            messageId: createdMessageId,
            userInput: newText,
            assistantId,
            tools: editedMessage.tools ?? undefined,
            additionalPrompt: editedMessage.promptTemplateContent ?? undefined,
            createLibrary: editedMessage.isCreateLibrary,
          }),
        });
        if (!streamContext) {
          restore();
          return;
        }

        const baseHandlers = createAssistantStreamHandlers(pendingAssistantId);
        await streamMessageContent(
          buildMessageContentFormData({ textData: streamContext.textData }),
          pendingAssistantId,
          isLibrary ? { ...baseHandlers, ...library.handlers } : baseHandlers,
          streamContext.target,
        );
      } catch (error) {
        console.error('Edit message failed', error);
        restore();
        library.abort();
      } finally {
        library.end();
        set({ isGenerating: false });
      }
    },
  };
});

/** 画面に出すメッセージ（兄弟バージョンのうち表示中のものだけをたどった並び）。移植元 visibleMessages */
export function useVisibleMessages(): Message[] {
  const messageRecords = useMessagesStore((s) => s.messageRecords);
  const messages = useMessagesStore((s) => s.messages);
  const activeVersionIndex = useMessagesStore((s) => s.activeVersionIndex);
  return useMemo(
    () => buildVisibleThread(messageRecords, messages, activeVersionIndex),
    [messageRecords, messages, activeVersionIndex],
  );
}

/** 表示中の user メッセージ ID ごとのバージョン情報（`1 / 3` の切り替え表示用）。移植元 versionInfoByMessageId */
export function useVersionInfoByMessageId(): Map<string, MessageVersionInfo> {
  const messageRecords = useMessagesStore((s) => s.messageRecords);
  const activeVersionIndex = useMessagesStore((s) => s.activeVersionIndex);
  return useMemo(
    () => buildVersionInfoByMessageId(messageRecords, activeVersionIndex),
    [messageRecords, activeVersionIndex],
  );
}
