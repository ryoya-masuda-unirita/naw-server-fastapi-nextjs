import { TestBed } from '@angular/core/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientService } from '@core/services/api-client';
import { FeedbackMessageApiService } from './feedback-message-api.service';
import { FeedbackRoomService } from './feedback-room-api.service';

function buildApiClient() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

const testQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('FeedbackMessageApiService', () => {
  let service: FeedbackMessageApiService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [
        provideTanStackQuery(testQueryClient()),
        FeedbackMessageApiService,
        { provide: ApiClientService, useValue: api },
      ],
    });
    service = TestBed.inject(FeedbackMessageApiService);
  });

  it('個別追加学習では選択フォルダIDをパスに含め、feedbackId を multipart に載せること', async () => {
    api.post.mockResolvedValue(undefined);
    const content = new File(['質問と回答'], '追加学習_fb-001.md', { type: 'text/markdown' });

    await service.addAdditionalLearning('folder-001', 'fb-001', content);

    expect(api.post).toHaveBeenCalledWith(
      '/admin/indexes/folder-001/additionalLearning',
      expect.any(FormData),
    );
    const body = api.post.mock.calls[0]?.[1] as FormData;
    expect(body.get('feedbackId')).toBe('fb-001');
    expect(body.get('content')).toBe(content);
  });
});

describe('FeedbackRoomService', () => {
  let service: FeedbackRoomService;
  let api: ReturnType<typeof buildApiClient>;

  beforeEach(() => {
    api = buildApiClient();
    TestBed.configureTestingModule({
      providers: [
        provideTanStackQuery(testQueryClient()),
        FeedbackRoomService,
        { provide: ApiClientService, useValue: api },
      ],
    });
    service = TestBed.inject(FeedbackRoomService);
  });

  it('満足度の個別追加学習でも選択フォルダIDをパスに含め、roomId を multipart に載せること', async () => {
    api.post.mockResolvedValue(undefined);
    const content = new File(['ルームの会話'], '追加学習_ルーム_room-001.md', {
      type: 'text/markdown',
    });

    await service.addAdditionalLearning('folder-001', 'room-001', content);

    expect(api.post).toHaveBeenCalledWith(
      '/admin/indexes/folder-001/additionalLearning',
      expect.any(FormData),
    );
    const body = api.post.mock.calls[0]?.[1] as FormData;
    expect(body.get('roomId')).toBe('room-001');
    expect(body.get('content')).toBe(content);
  });
});
