import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '@env/environment';
import { MessageContentStreamService } from './message-content-stream.service';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { MessageContentApiItem } from '@app-types/chat/message-api.type';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

describe('MessageContentStreamService', () => {
  let service: MessageContentStreamService;
  let api: ReturnType<typeof buildApiClientMock>;
  const originalEnv = { ...environment };

  beforeEach(() => {
    Object.assign(environment, { enableMock: true, apiBaseUrl: '/api' });
    api = buildApiClientMock();
    TestBed.configureTestingModule({
      providers: [MessageContentStreamService, { provide: ApiClientService, useValue: api }],
    });
    service = TestBed.inject(MessageContentStreamService);
  });

  afterEach(() => {
    Object.assign(environment, originalEnv);
  });

  it('モック経路で text_delta と message_content を順に通知すること', async () => {
    const item: MessageContentApiItem = {
      id: 'c-1',
      messageId: 'm-1',
      status: 'OK',
      question: 'Q',
      answer: 'a'.repeat(40),
      context: null,
      attachmentFiles: [],
      referencePaths: null,
      isRated: false,
    };
    api.post.mockResolvedValue(item);

    const deltas: string[] = [];
    let contentItem: MessageContentApiItem | null = null;

    await service.streamMessageContent(new FormData(), 'local-1', {
      onTextDelta: (text) => deltas.push(text),
      onMessageContent: (data) => {
        contentItem = data;
      },
    });

    expect(api.post).toHaveBeenCalledWith(API_PATHS.MESSAGES.CONTENT, expect.any(FormData));
    expect(deltas).toHaveLength(2);
    expect(deltas.join('')).toBe(item.answer);
    expect(contentItem).toMatchObject(item);
  });
});
