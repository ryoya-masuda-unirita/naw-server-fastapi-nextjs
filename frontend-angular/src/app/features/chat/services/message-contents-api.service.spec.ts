import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ApiClientService } from '@core/services/api-client';
import { CHAT_ASSISTANT_TYPE } from '@features/chat/constants/assistant-type.constants';
import type {
  MessageContentApiItem,
  MessagesListApiResponse,
} from '@app-types/chat/message-api.type';
import { buildErrorPlaceholder, MessageContentsApiService } from './message-contents-api.service';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    postFromCustomUrl: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

describe('MessageContentsApiService', () => {
  let service: MessageContentsApiService;
  let api: ReturnType<typeof buildApiClientMock>;

  const saasAssistant = {
    id: 'asst-saas',
    type: CHAT_ASSISTANT_TYPE.SAAS_CHAT,
    endpoints: [
      {
        type: 'AZURE_OPENAI_CHAT',
        destination: 'https://azure.example.com/',
        apiKey: '',
      },
    ],
  };

  const secureAssistant = {
    id: 'asst-secure',
    type: CHAT_ASSISTANT_TYPE.SECURE,
    endpoints: [
      {
        type: 'LOCAL_SERVER',
        destination: 'http://localhost:9090/',
        apiKey: 'local-key',
      },
    ],
  };

  beforeEach(() => {
    api = buildApiClientMock();
    TestBed.configureTestingModule({
      providers: [MessageContentsApiService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(MessageContentsApiService);
  });

  it('全 SAAS_CHAT の場合 NAW contents API のみ呼ぶこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [saasAssistant],
      messages: [
        {
          id: 'msg-1',
          roomId: 'room-1',
          assistantId: 'asst-saas',
          parentId: null,
          isRated: false,
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
    api.post.mockResolvedValue(contents);

    const result = await service.fetchContents(listData);

    expect(api.post).toHaveBeenCalledWith(API_PATHS.MESSAGES.CONTENTS, { messageIds: ['msg-1'] });
    expect(api.postFromCustomUrl).not.toHaveBeenCalled();
    expect(result.failures).toHaveLength(0);
    expect(result.contents).toEqual(contents);
  });

  it('全 SECURE の場合 LOCAL contents API のみ呼ぶこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [secureAssistant],
      messages: [
        {
          id: 'msg-secure-1',
          roomId: 'room-1',
          assistantId: 'asst-secure',
          parentId: null,
          isRated: false,
        },
      ],
    };
    const contents: MessageContentApiItem[] = [
      {
        id: 'content-secure-1',
        messageId: 'msg-secure-1',
        status: 'OK',
        question: 'ローカル質問',
        answer: 'ローカル回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      },
    ];
    api.postFromCustomUrl.mockResolvedValue(contents);

    const result = await service.fetchContents(listData);

    expect(api.post).not.toHaveBeenCalled();
    expect(api.postFromCustomUrl).toHaveBeenCalledWith(
      'http://localhost:9090/api/messages/contents',
      { messageIds: ['msg-secure-1'] },
      { headers: { 'X-Server-Auth-Key': 'local-key' } },
    );
    expect(result.failures).toHaveLength(0);
    expect(result.contents).toEqual(contents);
  });

  it('混在ルームでは NAW と LOCAL の両方を呼ぶこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [saasAssistant, secureAssistant],
      messages: [
        {
          id: 'msg-saas',
          roomId: 'room-1',
          assistantId: 'asst-saas',
          parentId: null,
          isRated: false,
        },
        {
          id: 'msg-secure',
          roomId: 'room-1',
          assistantId: 'asst-secure',
          parentId: 'msg-saas',
          isRated: false,
        },
      ],
    };

    api.post.mockResolvedValue([
      {
        id: 'content-saas',
        messageId: 'msg-saas',
        status: 'OK',
        question: 'SaaS',
        answer: 'SaaS answer',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      },
    ]);
    api.postFromCustomUrl.mockResolvedValue([
      {
        id: 'content-secure',
        messageId: 'msg-secure',
        status: 'OK',
        question: 'Secure',
        answer: 'Secure answer',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      },
    ]);

    const result = await service.fetchContents(listData);

    expect(api.post).toHaveBeenCalledWith(API_PATHS.MESSAGES.CONTENTS, {
      messageIds: ['msg-saas'],
    });
    expect(api.postFromCustomUrl).toHaveBeenCalledWith(
      'http://localhost:9090/api/messages/contents',
      { messageIds: ['msg-secure'] },
      { headers: { 'X-Server-Auth-Key': 'local-key' } },
    );
    expect(result.contents.map((item) => item.messageId)).toEqual(['msg-saas', 'msg-secure']);
  });

  it('LOCAL fetch 失敗時は ERROR プレースホルダーと failures を返すこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [secureAssistant],
      messages: [
        {
          id: 'msg-secure-1',
          roomId: 'room-1',
          assistantId: 'asst-secure',
          parentId: null,
          isRated: false,
        },
      ],
    };
    api.postFromCustomUrl.mockRejectedValue(new Error('network error'));

    const result = await service.fetchContents(listData);

    expect(result.failures).toEqual([{ messageIds: ['msg-secure-1'], reason: 'fetch_failed' }]);
    expect(result.contents).toEqual([buildErrorPlaceholder('msg-secure-1')]);
  });

  it('assistantId が null（アシスタント削除済み）のメッセージも NAW contents API の対象に含めること', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [],
      messages: [
        {
          id: 'msg-deleted-assistant',
          roomId: 'room-1',
          assistantId: null,
          parentId: null,
          isRated: false,
        },
      ],
    };
    const contents: MessageContentApiItem[] = [
      {
        id: 'content-1',
        messageId: 'msg-deleted-assistant',
        status: 'OK',
        question: '質問',
        answer: '回答',
        context: null,
        attachmentFiles: [],
        referencePaths: null,
        isRated: false,
      },
    ];
    api.post.mockResolvedValue(contents);

    const result = await service.fetchContents(listData);

    expect(api.post).toHaveBeenCalledWith(API_PATHS.MESSAGES.CONTENTS, {
      messageIds: ['msg-deleted-assistant'],
    });
    expect(result.failures).toHaveLength(0);
    expect(result.contents).toEqual(contents);
  });

  it('assistantId が null のメッセージと存在するアシスタントのメッセージが混在する場合、両方まとめて NAW contents API を呼ぶこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [saasAssistant],
      messages: [
        {
          id: 'msg-saas',
          roomId: 'room-1',
          assistantId: 'asst-saas',
          parentId: null,
          isRated: false,
        },
        {
          id: 'msg-deleted-assistant',
          roomId: 'room-1',
          assistantId: null,
          parentId: 'msg-saas',
          isRated: false,
        },
      ],
    };
    api.post.mockResolvedValue([]);

    await service.fetchContents(listData);

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe(API_PATHS.MESSAGES.CONTENTS);
    expect(body.messageIds.sort()).toEqual(['msg-deleted-assistant', 'msg-saas'].sort());
    expect(api.postFromCustomUrl).not.toHaveBeenCalled();
  });

  it('endpoint 不正の SECURE アシスタントは fetch せず ERROR を返すこと', async () => {
    const listData: MessagesListApiResponse = {
      assistants: [
        {
          ...secureAssistant,
          endpoints: [{ type: 'LOCAL_SERVER', destination: 'http://localhost:9090/', apiKey: '' }],
        },
      ],
      messages: [
        {
          id: 'msg-secure-1',
          roomId: 'room-1',
          assistantId: 'asst-secure',
          parentId: null,
          isRated: false,
        },
      ],
    };

    const result = await service.fetchContents(listData);

    expect(api.postFromCustomUrl).not.toHaveBeenCalled();
    expect(result.failures).toEqual([{ messageIds: ['msg-secure-1'], reason: 'missing_api_key' }]);
    expect(result.contents).toEqual([buildErrorPlaceholder('msg-secure-1')]);
  });
});
