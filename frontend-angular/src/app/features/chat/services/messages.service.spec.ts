import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageService } from './messages.service';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { Message } from '@app-types/chat/message.type';
import type {
  MessageContentApiItem,
  MessageContentTextData,
  MessagesListApiResponse,
} from '@app-types/chat/message-api.type';
import { mapMessageContentItemToAssistantMessage } from '@app-types/chat/message-api.type';
import { MessageContentStreamService } from './message-content-stream.service';
import { ViewerService } from './viewer.service';
import { MessageContentsApiService } from './message-contents-api.service';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from '@core/services/toast.service';
import { RoomsService } from './rooms.service';
import { AssistantsService } from './assistants.service';
import type { ChatRoom } from '@app-types/chat/chat-room.type';
import type { Assistant } from '@app-types/chat/assistant.type';
import { QueryClient } from '@tanstack/angular-query-experimental';

const textDataCapture = { last: undefined as MessageContentTextData | undefined };

type BuildMessageContentFormDataOptions = {
  textData: MessageContentTextData;
  attachmentFiles?: File[];
  historyAttachmentFiles?: File[];
};

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

function buildAssistantMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'content-1',
    messageId: 'msg-1',
    role: 'assistant',
    status: 'OK',
    question: '',
    answer: '回答',
    context: '',
    attachmentFiles: [],
    referenceFilePaths: [],
    isRated: false,
    ...overrides,
  };
}

describe('MessageService', () => {
  let service: MessageService;
  let api: ReturnType<typeof buildApiClientMock>;
  let nextStreamContent: MessageContentApiItem;
  let mockRooms: ChatRoom[];
  let mockQueryClient: { invalidateQueries: ReturnType<typeof vi.fn> };

  const mockAssistants: Assistant[] = [
    {
      id: 'asst-001',
      name: '社内情報アシスタント',
      description: 'desc',
      category: '一般',
      model: 'gpt-4o',
      isDefault: true,
    },
  ];

  const mockRoomsService = {
    allRooms: vi.fn(() => mockRooms),
    renameRoom: vi.fn().mockResolvedValue(undefined),
  };

  const mockAssistantsService = {
    assistantsQuery: {
      data: vi.fn(() => mockAssistants),
    },
  };

  const mockStreamService = {
    streamMessageContent: vi.fn(
      async (
        formData: FormData,
        localMessageId: string,
        handlers: {
          onTextDelta: (text: string) => void;
          onMessageContent: (item: MessageContentApiItem) => void;
        },
      ) => {
        const item = nextStreamContent;
        const answer = item.answer?.trim() ?? '';
        if (answer) {
          const chunkSize = 32;
          for (let i = 0; i < answer.length; i += chunkSize) {
            handlers.onTextDelta(answer.slice(i, i + chunkSize));
          }
        }
        handlers.onMessageContent(item);
        return mapMessageContentItemToAssistantMessage(item, localMessageId);
      },
    ),
  };

  const mockMessageContentsApi = {
    fetchContents: vi.fn(),
  };

  const mockToast = {
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  };

  const mockTranslate = {
    instant: vi.fn((key: string) => key),
  };

  beforeEach(() => {
    api = buildApiClientMock();
    mockRooms = [];
    mockQueryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };
    mockRoomsService.allRooms.mockImplementation(() => mockRooms);
    mockRoomsService.renameRoom.mockClear();
    mockStreamService.streamMessageContent.mockClear();
    mockMessageContentsApi.fetchContents.mockReset();
    mockToast.warning.mockReset();
    textDataCapture.last = undefined;

    nextStreamContent = {
      id: 'content-1',
      messageId: 'msg-1',
      status: 'OK',
      question: '',
      answer: '',
      context: null,
      attachmentFiles: [],
      referencePaths: null,
      isRated: false,
    };
    TestBed.configureTestingModule({
      providers: [
        MessageService,
        { provide: ApiClientService, useValue: api },
        { provide: MessageContentStreamService, useValue: mockStreamService },
        { provide: MessageContentsApiService, useValue: mockMessageContentsApi },
        { provide: ToastService, useValue: mockToast },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: RoomsService, useValue: mockRoomsService },
        { provide: AssistantsService, useValue: mockAssistantsService },
        { provide: QueryClient, useValue: mockQueryClient },
      ],
    });
    service = TestBed.inject(MessageService);
    type ServiceWithFormDataBuilder = {
      buildMessageContentFormData: (options: BuildMessageContentFormDataOptions) => FormData;
    };
    const serviceWithPrivate = service as unknown as ServiceWithFormDataBuilder;
    const originalBuildFormData = serviceWithPrivate.buildMessageContentFormData.bind(service);
    vi.spyOn(serviceWithPrivate, 'buildMessageContentFormData').mockImplementation(
      (options: BuildMessageContentFormDataOptions) => {
        textDataCapture.last = options.textData;
        return originalBuildFormData(options);
      },
    );
  });

  describe('loadMessagesForRoom', () => {
    it('messages 一覧 API の isRated / rating を assistant メッセージに反映すること', async () => {
      const listResponse: MessagesListApiResponse = {
        messages: [
          {
            id: 'msg-1',
            roomId: 'room-1',
            assistantId: 'asst-1',
            parentId: null,
            isRated: true,
            rating: 'BAD',
          },
        ],
      };
      const contents: MessageContentApiItem[] = [
        {
          id: 'content-1',
          messageId: 'msg-1',
          status: 'OK',
          question: '質問',
          answer: '回答',
          context: null,
          attachmentFiles: [],
          referencePaths: null,
          isRated: false,
        },
      ];

      api.get.mockResolvedValue(listResponse);
      mockMessageContentsApi.fetchContents.mockResolvedValue({
        contents,
        failures: [],
      });

      await service.loadMessagesForRoom('room-1', true);

      const messages = service.visibleMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({ role: 'user', isRated: true, rating: 'BAD' });
      expect(messages[1]).toMatchObject({ role: 'assistant', isRated: true, rating: 'BAD' });
      expect(mockMessageContentsApi.fetchContents).toHaveBeenCalledWith(listResponse);
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('POST /messages が message id 文字列のみ返す場合に content API を呼ぶこと', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      const contentItem: MessageContentApiItem = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: 'こんにちは',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      nextStreamContent = contentItem;
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('こんにちは', undefined, 'room-1', []);

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenNthCalledWith(
        1,
        API_PATHS.MESSAGES.CREATE,
        {
          roomId: 'room-1',
          assistantId: null,
          parentMessageId: null,
          messageText: 'こんにちは',
        },
        { responseType: 'text' },
      );
      expect(mockStreamService.streamMessageContent).toHaveBeenCalledTimes(1);
      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textDataPart = formData.get('textData');
      expect(textDataPart).toBeInstanceOf(Blob);
      expect((textDataPart as Blob).type).toBe('application/json');
      const textData = textDataCapture.last!;
      expect(textData).toEqual({
        messageId: createdId,
        userInput: 'こんにちは',
      });
      expect(textData).not.toHaveProperty('tools');
      expect(formData.get('historyAttachmentFiles')).toBeNull();

      const messages = service.visibleMessages();
      const user = messages.find((m) => m.role === 'user');
      expect(user).toMatchObject({ messageId: createdId });
      const assistant = messages.find((m) => m.role === 'assistant');
      expect(assistant).toMatchObject({
        status: 'OK',
        messageId: createdId,
        answer: 'AI回答',
      });
    });

    it('Web検索有効時は textData.tools に web_search を含めること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      const contentItem: MessageContentApiItem = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: '検索して',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      nextStreamContent = contentItem;
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('検索して', undefined, 'room-1', [], { useWebSearch: true });

      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textData = textDataCapture.last!;
      expect(textData.tools).toEqual([{ name: 'web_search' }]);
    });

    it('ライブラリ作成時は textData.createLibrary に true を含めること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: 'まとめて',
        answer: 'ライブラリを作成しました',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('まとめて', undefined, 'room-1', [], {
        createLibrary: true,
        useWebSearch: true,
        additionalPrompt: 'テンプレ本文',
      });

      const textData = textDataCapture.last!;
      expect(textData.createLibrary).toBe(true);

      // POST /api/messages の payload にもメタデータを含めて永続化させること
      const createCall = api.post.mock.calls.find((c) => c[0] === API_PATHS.MESSAGES.CREATE);
      expect(createCall?.[1]).toMatchObject({
        tools: [{ name: 'web_search' }],
        promptTemplateContent: 'テンプレ本文',
        isCreateLibrary: true,
      });
    });

    it('ライブラリ作成なしの場合は textData に createLibrary を含めないこと', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: 'こんにちは',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('こんにちは', undefined, 'room-1', []);

      expect(textDataCapture.last!).not.toHaveProperty('createLibrary');
    });

    it('送信直後にリロードせず再生成しても textData.assistantId が指定されること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: 'こんにちは',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('こんにちは', undefined, 'room-1', [], { assistantId: 'asst-1' });
      await service.regenerateMessage('content-1');

      expect(textDataCapture.last!.assistantId).toBe('asst-1');
    });

    it('ライブラリイベント受信時に ViewerService へストリーミング状態を反映すること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      const viewerService = TestBed.inject(ViewerService);
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });
      mockStreamService.streamMessageContent.mockImplementationOnce(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onTextDelta: (text: string) => void;
            onLibraryTitleDelta?: (text: string) => void;
            onLibraryContentDelta?: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onLibraryTitleDelta?.('会議');
          expect(viewerService.isLibraryStreaming()).toBe(true);
          handlers.onLibraryTitleDelta?.('メモ');
          handlers.onLibraryContentDelta?.('# 内容\n');
          handlers.onLibraryContentDelta?.('要点一覧');
          handlers.onTextDelta('「会議メモ」を作成しました');
          handlers.onMessageContent(nextStreamContent);
          return mapMessageContentItemToAssistantMessage(nextStreamContent, localMessageId);
        },
      );

      await service.sendMessage('まとめて', undefined, 'room-1', [], { createLibrary: true });

      expect(viewerService.streamingLibraryTitle()).toBe('会議メモ');
      expect(viewerService.markdownContent()).toBe('# 内容\n要点一覧');
      expect(viewerService.isLibraryStreaming()).toBe(false);
    });

    it('テンプレート選択時は textData.additionalPrompt に systemPrompt を含めること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      const contentItem: MessageContentApiItem = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: 'こんにちは',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      nextStreamContent = contentItem;
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('こんにちは', undefined, 'room-1', [], {
        additionalPrompt: '返答は日本語と英語両方を返してください',
      });

      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textData = textDataCapture.last!;
      expect(textData.additionalPrompt).toBe('返答は日本語と英語両方を返してください');
    });

    it('初回送信かつ仮名ルームの場合、メッセージ送信成功後に renameRoom を呼ぶこと', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      mockRooms = [
        {
          id: 'room-1',
          name: '社内情報アシスタント',
          isPinned: false,
          category: 'chat',
          defaultAssistantId: 'asst-001',
        },
      ];
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: '営業資料について教えて',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('営業資料について教えて', undefined, 'room-1', []);

      expect(mockRoomsService.renameRoom).toHaveBeenCalledWith('room-1', '営業資料について教えて');
    });

    it('2通目以降は renameRoom を呼ばないこと', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      mockRooms = [
        {
          id: 'room-1',
          name: '社内情報アシスタント',
          isPinned: false,
          category: 'chat',
          defaultAssistantId: 'asst-001',
        },
      ];
      service['_messages'].set([
        {
          id: 'msg-existing',
          messageId: 'msg-existing',
          role: 'user',
          status: 'COMPLETE',
          question: '1通目',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
        },
      ]);
      nextStreamContent = {
        id: 'content-2',
        messageId: createdId,
        status: 'OK',
        question: '2通目',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('2通目', undefined, 'room-1', []);

      expect(mockRoomsService.renameRoom).not.toHaveBeenCalled();
    });

    it('手動リネーム済みルームでは renameRoom を呼ばないこと', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      mockRooms = [
        {
          id: 'room-1',
          name: '重要案件',
          isPinned: false,
          category: 'chat',
          defaultAssistantId: 'asst-001',
        },
      ];
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: '質問',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.sendMessage('質問', undefined, 'room-1', []);

      expect(mockRoomsService.renameRoom).not.toHaveBeenCalled();
    });

    it('renameRoom 失敗時も sendMessage は完了すること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73186';
      mockRooms = [
        {
          id: 'room-1',
          name: '',
          isPinned: false,
          category: 'chat',
          defaultAssistantId: 'asst-001',
        },
      ];
      mockRoomsService.renameRoom.mockRejectedValueOnce(new Error('rename failed'));
      nextStreamContent = {
        id: 'content-1',
        messageId: createdId,
        status: 'OK',
        question: '初回質問',
        answer: 'AI回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await expect(
        service.sendMessage('初回質問', undefined, 'room-1', []),
      ).resolves.toBeUndefined();
      expect(mockRoomsService.renameRoom).toHaveBeenCalledWith('room-1', '初回質問');
    });
  });

  describe('regenerateMessage', () => {
    beforeEach(() => {
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
        },
        buildAssistantMessage({ assistantId: 'asst-1' }),
      ]);
    });

    it('DELETE を呼ばず通常送信と同じ textData スキーマで SSE ストリームを処理すること', async () => {
      const contentItem: MessageContentApiItem = {
        id: 'content-1',
        messageId: 'msg-1',
        status: 'OK',
        question: '質問',
        answer: 'a'.repeat(40),
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      nextStreamContent = contentItem;

      await service.regenerateMessage('content-1');

      expect(api.delete).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      expect(mockStreamService.streamMessageContent).toHaveBeenCalledTimes(1);
      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textData = textDataCapture.last!;
      expect(textData).toEqual({
        messageId: 'msg-1',
        userInput: '質問',
        assistantId: 'asst-1',
        messageContentId: 'content-1',
      });
      expect(service.visibleMessages()[1]).toMatchObject({
        id: 'content-1',
        status: 'OK',
        answer: contentItem.answer,
      });
    });

    it('元のチャットで使用した tools / テンプレート / ライブラリ設定を textData に再利用すること', async () => {
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
          tools: [{ name: 'mcp', server_label: 'srv', server_url: 'http://example' }],
          promptTemplateContent: 'テンプレ本文',
          isCreateLibrary: true,
        },
        buildAssistantMessage({
          assistantId: 'asst-1',
          tools: [{ name: 'mcp', server_label: 'srv', server_url: 'http://example' }],
          promptTemplateContent: 'テンプレ本文',
          isCreateLibrary: true,
        }),
      ]);
      nextStreamContent = {
        id: 'content-1',
        messageId: 'msg-1',
        status: 'OK',
        question: '質問',
        answer: '再回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };

      await service.regenerateMessage('content-1');

      const textData = textDataCapture.last!;
      expect(textData.tools).toEqual([
        { name: 'mcp', server_label: 'srv', server_url: 'http://example' },
      ]);
      expect(textData.additionalPrompt).toBe('テンプレ本文');
      expect(textData.createLibrary).toBe(true);
    });

    it('ライブラリ再生成時に ViewerService へストリーミング状態を反映すること', async () => {
      const viewerService = TestBed.inject(ViewerService);
      service['_messageRecords'].set([
        { id: 'msg-1', roomId: 'room-1', assistantId: 'asst-1', parentId: null, isRated: false },
      ]);
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: 'まとめて',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
          isCreateLibrary: true,
        },
        buildAssistantMessage({ assistantId: 'asst-1', isCreateLibrary: true }),
      ]);
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });
      nextStreamContent = {
        id: 'content-1',
        messageId: 'msg-1',
        status: 'OK',
        question: 'まとめて',
        answer: '「会議メモ」を作成しました',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      mockStreamService.streamMessageContent.mockImplementationOnce(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onTextDelta: (text: string) => void;
            onLibraryTitleDelta?: (text: string) => void;
            onLibraryContentDelta?: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onLibraryTitleDelta?.('会議');
          expect(viewerService.isLibraryStreaming()).toBe(true);
          handlers.onLibraryTitleDelta?.('メモ');
          handlers.onLibraryContentDelta?.('# 内容\n');
          handlers.onLibraryContentDelta?.('要点一覧');
          handlers.onMessageContent(nextStreamContent);
          return mapMessageContentItemToAssistantMessage(nextStreamContent, localMessageId);
        },
      );

      await service.regenerateMessage('content-1');

      expect(viewerService.streamingLibraryTitle()).toBe('会議メモ');
      expect(viewerService.markdownContent()).toBe('# 内容\n要点一覧');
      expect(viewerService.isLibraryStreaming()).toBe(false);
    });
  });

  describe('webSearchRetryMessage', () => {
    beforeEach(() => {
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
        },
        buildAssistantMessage({ assistantId: 'asst-1' }),
      ]);
    });

    it('textData.tools に web_search を含めて再送信すること', async () => {
      nextStreamContent = {
        id: 'content-1',
        messageId: 'msg-1',
        status: 'OK',
        question: '質問',
        answer: '再回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };

      await service.webSearchRetryMessage('content-1');

      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textData = textDataCapture.last!;
      expect(textData.tools).toEqual([{ name: 'web_search' }]);
    });
  });

  describe('editMessage', () => {
    beforeEach(() => {
      service['_messageRecords'].set([
        {
          id: 'msg-1',
          roomId: 'room-1',
          assistantId: 'asst-1',
          parentId: null,
          isRated: false,
        },
        {
          id: 'msg-2',
          roomId: 'room-1',
          assistantId: 'asst-1',
          parentId: 'msg-1',
          isRated: false,
        },
      ]);
      service['_activeVersionIndex'].set(new Map());
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '元の質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
          parentId: null,
        },
        buildAssistantMessage({ assistantId: 'asst-1', parentId: 'msg-1' }),
        {
          id: 'msg-2',
          messageId: 'msg-2',
          role: 'user',
          status: 'COMPLETE',
          question: '後続の質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
          parentId: 'msg-1',
        },
        buildAssistantMessage({
          id: 'content-2',
          messageId: 'msg-2',
          assistantId: 'asst-1',
          parentId: 'msg-2',
        }),
      ]);
    });

    it('編集時に parentMessageId へ編集対象 user の parentId を付けて兄弟メッセージを追加すること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73187';
      const contentItem: MessageContentApiItem = {
        id: 'content-edit-1',
        messageId: createdId,
        status: 'OK',
        question: '編集後の質問',
        answer: '編集後の回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      nextStreamContent = contentItem;
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      expect(api.post).toHaveBeenCalledTimes(1);
      expect(api.post).toHaveBeenNthCalledWith(
        1,
        API_PATHS.MESSAGES.CREATE,
        {
          roomId: 'room-1',
          assistantId: 'asst-1',
          parentMessageId: null,
          messageText: '編集後の質問',
        },
        { responseType: 'text' },
      );
      expect(mockStreamService.streamMessageContent).toHaveBeenCalledTimes(1);

      const formData = mockStreamService.streamMessageContent.mock.calls[0][0] as FormData;
      const textData = textDataCapture.last!;
      expect(textData).toEqual({
        messageId: createdId,
        userInput: '編集後の質問',
        assistantId: 'asst-1',
      });

      const messages = service.visibleMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]).toMatchObject({
        role: 'user',
        question: '編集後の質問',
        messageId: createdId,
      });
      expect(messages[1]).toMatchObject({
        role: 'assistant',
        status: 'OK',
        answer: '編集後の回答',
      });
      expect(service['_messages']()).toHaveLength(6);
    });

    it('編集対象で使用した tools / テンプレート / ライブラリ設定を textData に再利用すること', async () => {
      service['_messages'].update((msgs) =>
        msgs.map((m) =>
          m.id === 'msg-1'
            ? {
                ...m,
                tools: [{ name: 'web_search' }],
                promptTemplateContent: 'テンプレ本文',
                isCreateLibrary: true,
              }
            : m,
        ),
      );
      const createdId = '5821a6f420f745c0b18c2e31adf73187';
      nextStreamContent = {
        id: 'content-edit-1',
        messageId: createdId,
        status: 'OK',
        question: '編集後の質問',
        answer: '編集後の回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      const textData = textDataCapture.last!;
      expect(textData.tools).toEqual([{ name: 'web_search' }]);
      expect(textData.additionalPrompt).toBe('テンプレ本文');
      expect(textData.createLibrary).toBe(true);

      // POST /api/messages の payload にもメタデータを再利用して送ること
      const createCall = api.post.mock.calls.find((c) => c[0] === API_PATHS.MESSAGES.CREATE);
      expect(createCall?.[1]).toMatchObject({
        tools: [{ name: 'web_search' }],
        promptTemplateContent: 'テンプレ本文',
        isCreateLibrary: true,
      });
    });

    it('ライブラリ編集時に ViewerService へストリーミング状態を反映すること', async () => {
      const viewerService = TestBed.inject(ViewerService);
      service['_messages'].update((msgs) =>
        msgs.map((m) => (m.id === 'msg-1' ? { ...m, isCreateLibrary: true } : m)),
      );
      const createdId = '5821a6f420f745c0b18c2e31adf73187';
      nextStreamContent = {
        id: 'content-edit-1',
        messageId: createdId,
        status: 'OK',
        question: '編集後の質問',
        answer: '「会議メモ」を作成しました',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.get.mockResolvedValue({ data: [{ id: 'lib-1', title: '会議メモ' }] });
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });
      mockStreamService.streamMessageContent.mockImplementationOnce(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onTextDelta: (text: string) => void;
            onLibraryTitleDelta?: (text: string) => void;
            onLibraryContentDelta?: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onLibraryTitleDelta?.('会議');
          expect(viewerService.isLibraryStreaming()).toBe(true);
          handlers.onLibraryTitleDelta?.('メモ');
          handlers.onLibraryContentDelta?.('# 内容\n');
          handlers.onLibraryContentDelta?.('要点一覧');
          handlers.onMessageContent(nextStreamContent);
          return mapMessageContentItemToAssistantMessage(nextStreamContent, localMessageId);
        },
      );

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      expect(viewerService.streamingLibraryTitle()).toBe('会議メモ');
      expect(viewerService.markdownContent()).toBe('# 内容\n要点一覧');
      expect(viewerService.isLibraryStreaming()).toBe(false);
    });

    it('編集対象 user の parentId を parentMessageId として送ること', async () => {
      const serverMessageId = '5821a6f420f745c0b18c2e31adf73187';
      service['_messageRecords'].set([
        {
          id: serverMessageId,
          roomId: 'room-1',
          assistantId: 'asst-1',
          parentId: 'prev-msg',
          isRated: false,
        },
      ]);
      service['_messages'].set([
        {
          id: 'msg-1780014101810',
          messageId: serverMessageId,
          role: 'user',
          status: 'COMPLETE',
          question: '元の質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
          parentId: 'prev-msg',
        },
        buildAssistantMessage({ messageId: serverMessageId, assistantId: 'asst-1' }),
      ]);

      const createdId = 'new-msg-after-edit';
      nextStreamContent = {
        id: 'content-edit-2',
        messageId: createdId,
        status: 'OK',
        question: '編集後',
        answer: '回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.editMessage('msg-1780014101810', '編集後', 'room-1');

      expect(api.post).toHaveBeenNthCalledWith(
        1,
        API_PATHS.MESSAGES.CREATE,
        expect.objectContaining({ parentMessageId: 'prev-msg' }),
        { responseType: 'text' },
      );
    });

    it('編集中の応答メッセージにアシスタントIDが設定されること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73187';
      let capturedPendingAssistant: Message | undefined;

      mockStreamService.streamMessageContent.mockImplementationOnce(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onTextDelta: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          // ストリーム開始直後（PENDING状態）のメッセージを記録する
          capturedPendingAssistant = service['_messages']().find(
            (m) => m.role === 'assistant' && m.status === 'PENDING',
          );
          handlers.onTextDelta('回答');
          handlers.onMessageContent(nextStreamContent);
          return mapMessageContentItemToAssistantMessage(nextStreamContent, localMessageId);
        },
      );

      nextStreamContent = {
        id: 'content-edit-1',
        messageId: createdId,
        status: 'OK',
        question: '編集後の質問',
        answer: '編集後の回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };
      api.post.mockImplementation((url: string) => {
        if (url === API_PATHS.MESSAGES.CREATE) {
          return Promise.resolve(createdId);
        }
        return Promise.reject(new Error(`Unexpected POST ${url}`));
      });

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      expect(capturedPendingAssistant).toBeDefined();
      expect(capturedPendingAssistant?.assistantId).toBe('asst-1');
    });

    it('editMessage 失敗時に _messages / _messageRecords / _activeVersionIndex を復元すること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73188';
      api.post.mockResolvedValue(createdId);
      mockStreamService.streamMessageContent.mockRejectedValueOnce(new Error('stream failed'));

      const messagesBefore = [...service['_messages']()];
      const recordsBefore = [...service['_messageRecords']()];
      const indexBefore = new Map(service['_activeVersionIndex']());

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      expect(service['_messages']()).toEqual(messagesBefore);
      expect(service['_messageRecords']()).toEqual(recordsBefore);
      expect(service['_activeVersionIndex']()).toEqual(indexBefore);
      expect(mockStreamService.streamMessageContent).toHaveBeenCalled();
    });
  });

  describe('switchVersion', () => {
    beforeEach(() => {
      service['_messageRecords'].set([
        { id: 'root-a', roomId: 'room-1', assistantId: 'asst-1', parentId: null, isRated: false },
        { id: 'root-b', roomId: 'room-1', assistantId: 'asst-1', parentId: null, isRated: false },
        {
          id: 'child-a',
          roomId: 'room-1',
          assistantId: 'asst-1',
          parentId: 'root-a',
          isRated: false,
        },
      ]);
      service['_activeVersionIndex'].set(new Map([['__root__', 1]]));
      service['_messages'].set([
        {
          id: 'u-a',
          messageId: 'root-a',
          role: 'user',
          status: 'COMPLETE',
          question: '質問A',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          parentId: null,
        },
        buildAssistantMessage({ id: 'a-a', messageId: 'root-a', answer: '回答A' }),
        {
          id: 'u-b',
          messageId: 'root-b',
          role: 'user',
          status: 'COMPLETE',
          question: '質問B',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          parentId: null,
        },
        buildAssistantMessage({ id: 'a-b', messageId: 'root-b', answer: '回答B' }),
        {
          id: 'u-child',
          messageId: 'child-a',
          role: 'user',
          status: 'COMPLETE',
          question: '子質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          parentId: 'root-a',
        },
        buildAssistantMessage({ id: 'a-child', messageId: 'child-a', answer: '子回答' }),
      ]);
    });

    it('prev で兄弟 user 枝を切り替え、対応する assistant も表示すること', () => {
      expect(service.visibleMessages().map((m) => m.question || m.answer)).toEqual([
        '質問B',
        '回答B',
      ]);

      service.switchVersion('__root__', 'prev');

      expect(service.visibleMessages().map((m) => m.question || m.answer)).toEqual([
        '質問A',
        '回答A',
        '子質問',
        '子回答',
      ]);
    });

    it('getVersionInfo はアクティブ user にのみ pagination 情報を返すこと', () => {
      const activeUser = service.visibleMessages()[0];
      const info = service.getVersionInfo(activeUser);
      expect(info).toEqual({
        groupKey: '__root__',
        current: 2,
        total: 2,
        canPrev: true,
        canNext: false,
      });
    });

    it('versionInfoByMessageId はアクティブ user の messageId のみ含めること', () => {
      expect(service.versionInfoByMessageId().get('root-b')).toEqual({
        groupKey: '__root__',
        current: 2,
        total: 2,
        canPrev: true,
        canNext: false,
      });
      expect(service.versionInfoByMessageId().has('root-a')).toBe(false);
    });
  });

  describe('rateMessage', () => {
    beforeEach(() => {
      service['_messages'].set([
        buildAssistantMessage(),
        buildAssistantMessage({
          id: 'content-2',
          messageId: 'msg-2',
        }),
      ]);
    });

    it('GOOD 評価時に isRated と rating を楽観的に更新し API を呼ぶこと', async () => {
      api.post.mockResolvedValue({ data: { messageId: 'msg-1', rating: 'GOOD' } });

      await service.rateMessage('msg-1', 'GOOD');

      expect(api.post).toHaveBeenCalledWith(API_PATHS.MESSAGES.FEEDBACK('msg-1'), {
        rating: 'GOOD',
      });
      expect(service.visibleMessages()[0]).toMatchObject({
        messageId: 'msg-1',
        isRated: true,
        rating: 'GOOD',
      });
      expect(service.visibleMessages()[1].isRated).toBe(false);
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        predicate: expect.any(Function),
      });
    });

    it('BAD 評価時に isRated と rating を楽観的に更新すること', async () => {
      api.post.mockResolvedValue({ data: { messageId: 'msg-1', rating: 'BAD' } });

      await service.rateMessage('msg-1', 'BAD');

      expect(service.visibleMessages()[0]).toMatchObject({
        isRated: true,
        rating: 'BAD',
      });
    });

    it('GOOD 評価済みから BAD 評価へ切り替えできること', async () => {
      service['_messages'].set([buildAssistantMessage({ isRated: true, rating: 'GOOD' })]);
      api.post.mockResolvedValue({ data: { messageId: 'msg-1', rating: 'BAD' } });

      await service.rateMessage('msg-1', 'BAD');

      expect(service.visibleMessages()[0]).toMatchObject({
        isRated: true,
        rating: 'BAD',
      });
    });

    it('API 失敗時に状態をロールバックすること', async () => {
      const original = service.visibleMessages();
      api.post.mockRejectedValue(new Error('Network error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await expect(service.rateMessage('msg-1', 'GOOD')).rejects.toThrow('Network error');

      expect(service.visibleMessages()).toEqual(original);
      expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('精度評価一覧と回答数一覧だけを更新対象にすること', async () => {
      api.post.mockResolvedValue({ data: { messageId: 'msg-1', rating: 'GOOD' } });

      await service.rateMessage('msg-1', 'GOOD');

      const [{ predicate }] = mockQueryClient.invalidateQueries.mock.calls[0];

      expect(predicate({ queryKey: ['feedback', 'accuracy'] })).toBe(true);
      expect(predicate({ queryKey: ['feedback', 'users'] })).toBe(true);
      expect(predicate({ queryKey: ['feedback', 'satisfaction'] })).toBe(false);
      expect(predicate({ queryKey: ['admin', 'users'] })).toBe(false);
    });
  });

  describe('推論テキストの表示', () => {
    const contentItem: MessageContentApiItem = {
      id: 'content-1',
      messageId: 'msg-1',
      status: 'OK',
      question: '質問',
      answer: '最終回答',
      context: null,
      attachmentFiles: [],
      referencePaths: null,
      isRated: false,
    };

    const streamMock = {
      streamMessageContent: vi.fn(),
    };

    beforeEach(() => {
      streamMock.streamMessageContent.mockImplementation(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onReasoningDelta?: (text: string) => void;
            onTextDelta: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onReasoningDelta?.('**Checking weather**\n\nThe user is asking');
          handlers.onTextDelta('最終');
          handlers.onMessageContent(contentItem);
          return {
            id: localMessageId,
            messageId: 'msg-1',
            role: 'assistant',
            status: 'OK',
            question: '',
            answer: '最終回答',
            context: '',
            isRated: false,
          } satisfies Message;
        },
      );

      TestBed.resetTestingModule();
      api = buildApiClientMock();
      mockRooms = [];
      mockRoomsService.renameRoom.mockClear();
      TestBed.configureTestingModule({
        providers: [
          MessageService,
          { provide: MessageContentStreamService, useValue: streamMock },
          { provide: ApiClientService, useValue: api },
          { provide: MessageContentsApiService, useValue: mockMessageContentsApi },
          { provide: ToastService, useValue: mockToast },
          { provide: TranslateService, useValue: mockTranslate },
          { provide: RoomsService, useValue: mockRoomsService },
          { provide: AssistantsService, useValue: mockAssistantsService },
          { provide: QueryClient, useValue: mockQueryClient },
        ],
      });
      service = TestBed.inject(MessageService);
      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
        },
        buildAssistantMessage({
          assistantId: 'asst-1',
          reasoning: {
            sections: [{ summary: 'Old summary', detail: 'Old detail' }],
          },
        }),
      ]);
    });

    it('再生成すると推論テキストが表示され、回答が完了しても推論テキストが消えないこと', async () => {
      await service.regenerateMessage('content-1');

      const assistant = service.visibleMessages().find((m) => m.id === 'content-1');
      expect(assistant?.reasoning).toEqual({
        sections: [{ summary: 'Checking weather', detail: 'The user is asking' }],
      });
      expect(assistant?.answer).toBe('最終回答');
      expect(assistant?.status).toBe('OK');
    });

    it('再生成を開始すると、前回の推論テキストがクリアされること', async () => {
      streamMock.streamMessageContent.mockImplementation(async (_formData, _localMessageId) => {
        const assistant = service.visibleMessages().find((m) => m.id === 'content-1');
        expect(assistant?.reasoning).toBeUndefined();
        expect(assistant?.answer).toBe('');
        expect(assistant?.status).toBe('PENDING');
        return buildAssistantMessage({ answer: '最終回答' });
      });

      await service.regenerateMessage('content-1');
    });

    it('回答が確定した後に届いた推論テキストも画面上に反映されること', async () => {
      streamMock.streamMessageContent.mockImplementation(
        async (
          _formData: FormData,
          _localMessageId: string,
          handlers: {
            onReasoningDelta?: (text: string) => void;
            onTextDelta: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onMessageContent({ ...contentItem, id: 'content-new-id' });
          handlers.onReasoningDelta?.('**Checking weather**\n\nThe user is asking');
          return buildAssistantMessage({ id: 'content-new-id', answer: '最終回答' });
        },
      );

      await service.regenerateMessage('content-1');

      const assistant = service.visibleMessages().find((m) => m.id === 'content-new-id');
      expect(assistant?.reasoning).toEqual({
        sections: [{ summary: 'Checking weather', detail: 'The user is asking' }],
      });
    });

    it('メッセージを編集して再送信しても推論テキストが表示されること', async () => {
      const createdId = '5821a6f420f745c0b18c2e31adf73187';
      const editContentItem: MessageContentApiItem = {
        id: 'content-edit-1',
        messageId: createdId,
        status: 'OK',
        question: '編集後の質問',
        answer: '編集後の回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      };

      api.post.mockResolvedValue(createdId);
      streamMock.streamMessageContent.mockImplementation(
        async (
          _formData: FormData,
          localMessageId: string,
          handlers: {
            onReasoningDelta?: (text: string) => void;
            onTextDelta: (text: string) => void;
            onMessageContent: (item: MessageContentApiItem) => void;
          },
        ) => {
          handlers.onMessageContent(editContentItem);
          handlers.onReasoningDelta?.('**Checking weather**\n\nThe user is asking');
          return {
            id: editContentItem.id,
            messageId: createdId,
            role: 'assistant',
            status: 'OK',
            question: '',
            answer: editContentItem.answer ?? '',
            context: '',
            isRated: false,
          } satisfies Message;
        },
      );

      service['_messages'].set([
        {
          id: 'msg-1',
          messageId: 'msg-1',
          role: 'user',
          status: 'COMPLETE',
          question: '元の質問',
          answer: '',
          context: '',
          attachmentFiles: [],
          referenceFilePaths: [],
          isRated: false,
          assistantId: 'asst-1',
        },
        buildAssistantMessage({ assistantId: 'asst-1' }),
      ]);

      await service.editMessage('msg-1', '編集後の質問', 'room-1');

      const assistant = service.visibleMessages().find((m) => m.id === 'content-edit-1');
      expect(assistant?.reasoning).toEqual({
        sections: [{ summary: 'Checking weather', detail: 'The user is asking' }],
      });
      expect(assistant?.answer).toBe('編集後の回答');
    });
  });
});
