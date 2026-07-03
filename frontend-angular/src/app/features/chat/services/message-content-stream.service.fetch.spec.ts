import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '@env/environment';
import { MessageContentStreamService } from './message-content-stream.service';
import { ApiClientService } from '@core/services/api-client';
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

function encodeSseEvent(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data:${JSON.stringify(payload)}\n\n`);
}

describe('MessageContentStreamService (fetch SSE)', () => {
  let service: MessageContentStreamService;
  const fetchMock = vi.fn();
  const originalEnv = { ...environment };

  beforeEach(() => {
    // vi.mock によるモジュールキャッシュ汚染を避けるため、実行時に直接書き換える
    (environment as Record<string, unknown>)['enableMock'] = false;
    (environment as Record<string, unknown>)['apiBaseUrl'] = 'https://api.test/api';

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('location', { hostname: 'localhost' });
    TestBed.configureTestingModule({
      providers: [
        MessageContentStreamService,
        { provide: ApiClientService, useValue: buildApiClientMock() },
      ],
    });
    service = TestBed.inject(MessageContentStreamService);
  });

  afterEach(() => {
    (environment as Record<string, unknown>)['enableMock'] = true;
    (environment as Record<string, unknown>)['apiBaseUrl'] = '/api';
    vi.unstubAllGlobals();
    Object.assign(environment, originalEnv);
  });

  it('fetch SSE の text_delta と message_content を順に通知すること', async () => {
    const finalItem: MessageContentApiItem = {
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

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseEvent({ type: 'text_delta', text: '最終' }));
        controller.enqueue(encodeSseEvent({ type: 'text_delta', text: '回答' }));
        controller.enqueue(encodeSseEvent({ type: 'message_content', data: finalItem }));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const deltas: string[] = [];
    let contentItem: MessageContentApiItem | null = null;
    const formData = new FormData();
    formData.append(
      'textData',
      new Blob(
        [
          JSON.stringify({
            messageId: 'msg-1',
            userInput: '質問',
            messageContentId: 'content-1',
          }),
        ],
        { type: 'application/json' },
      ),
    );

    const result = await service.streamMessageContent(formData, 'content-1', {
      onTextDelta: (text) => deltas.push(text),
      onMessageContent: (data) => {
        contentItem = data;
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/api/messages/content',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
    );
    expect(deltas).toEqual(['最終', '回答']);
    expect(contentItem).toMatchObject(finalItem);
    expect(result).toMatchObject({
      id: 'content-1',
      messageId: 'msg-1',
      answer: '最終回答',
    });
  });

  it('fetch SSE の reasoning_delta を handler に通知すること', async () => {
    const finalItem: MessageContentApiItem = {
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

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encodeSseEvent({ type: 'reasoning_delta', text: '**Checking weather**\n\nThe user' }),
        );
        controller.enqueue(encodeSseEvent({ type: 'text_delta', text: '回答' }));
        controller.enqueue(encodeSseEvent({ type: 'message_content', data: finalItem }));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const reasoningDeltas: string[] = [];
    const formData = new FormData();

    await service.streamMessageContent(formData, 'content-1', {
      onReasoningDelta: (text) => reasoningDeltas.push(text),
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(reasoningDeltas).toEqual(['**Checking weather**\n\nThe user']);
  });

  it('fetch SSE の library_title_delta と library_content_delta を handler に通知すること', async () => {
    const finalItem: MessageContentApiItem = {
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

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseEvent({ type: 'library_title_delta', text: '会議' }));
        controller.enqueue(encodeSseEvent({ type: 'library_title_delta', text: 'メモ' }));
        controller.enqueue(encodeSseEvent({ type: 'library_content_delta', text: '# 内容\n' }));
        controller.enqueue(encodeSseEvent({ type: 'library_content_delta', text: '要点一覧' }));
        controller.enqueue(
          encodeSseEvent({ type: 'text_delta', text: '「会議メモ」を作成しました' }),
        );
        controller.enqueue(encodeSseEvent({ type: 'message_content', data: finalItem }));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const titleDeltas: string[] = [];
    const contentDeltas: string[] = [];
    const textDeltas: string[] = [];
    const formData = new FormData();

    await service.streamMessageContent(formData, 'content-1', {
      onTextDelta: (text) => textDeltas.push(text),
      onLibraryTitleDelta: (text) => titleDeltas.push(text),
      onLibraryContentDelta: (text) => contentDeltas.push(text),
      onMessageContent: () => undefined,
    });

    expect(titleDeltas).toEqual(['会議', 'メモ']);
    expect(contentDeltas).toEqual(['# 内容\n', '要点一覧']);
    expect(textDeltas).toEqual(['「会議メモ」を作成しました']);
  });

  it('library イベントの handler 未指定でもストリーム処理が完了すること', async () => {
    const finalItem: MessageContentApiItem = {
      id: 'content-1',
      messageId: 'msg-1',
      status: 'OK',
      question: '質問',
      answer: '回答',
      context: null,
      attachmentFiles: [],
      referencePaths: null,
      isRated: false,
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encodeSseEvent({ type: 'library_title_delta', text: 'タイトル' }));
        controller.enqueue(encodeSseEvent({ type: 'library_content_delta', text: '本文' }));
        controller.enqueue(encodeSseEvent({ type: 'message_content', data: finalItem }));
        controller.close();
      },
    });

    fetchMock.mockResolvedValue({
      ok: true,
      body: stream,
    });

    const result = await service.streamMessageContent(new FormData(), 'content-1', {
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(result).toMatchObject({ id: 'content-1', messageId: 'msg-1' });
  });
});
