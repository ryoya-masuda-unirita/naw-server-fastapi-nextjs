import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { persistTenantId } from '@/lib/api-client';
import { mockPath } from '@/mocks/utils';
import type { MessageContentApiItem } from '@/types/chat/message-api.type';
import { streamMessageContent } from './message-content-stream';

const LOCAL_CONTENT_URL = 'https://local.test/api/messages/content';

const FIXTURE_FINAL_ITEM: MessageContentApiItem = {
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

function encode(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`data:${JSON.stringify(payload)}\n\n`);
}

/** 指定したチャンクをそのまま順に流す SSE の応答 */
function sseResponse(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}

function buildFormData(): FormData {
  const formData = new FormData();
  formData.append(
    'textData',
    new Blob([JSON.stringify({ messageId: 'msg-1', userInput: '質問' })], {
      type: 'application/json',
    }),
  );
  return formData;
}

describe('streamMessageContent', () => {
  test('text_delta と message_content を順に通知し、最終の回答を返すこと', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([
          encode({ type: 'text_delta', text: '最終' }),
          encode({ type: 'text_delta', text: '回答' }),
          encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM }),
        ]),
      ),
    );

    const deltas: string[] = [];
    let received: MessageContentApiItem | null = null;
    const result = await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: (text) => deltas.push(text),
      onMessageContent: (item) => {
        received = item;
      },
    });

    expect(deltas).toEqual(['最終', '回答']);
    expect(received).toMatchObject(FIXTURE_FINAL_ITEM);
    expect(result).toMatchObject({ id: 'content-1', messageId: 'msg-1', answer: '最終回答' });
  });

  test('NAW サーバーには Accept・X-Tenant-ID・Cookie 付きで送ること', async () => {
    persistTenantId('tenant-1');
    let request: Request | null = null;
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), ({ request: req }) => {
        request = req;
        return sseResponse([encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM })]);
      }),
    );

    await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(request!.headers.get('accept')).toBe('text/event-stream');
    expect(request!.headers.get('x-tenant-id')).toBe('tenant-1');
    expect(request!.credentials).toBe('include');
  });

  test('reasoning・library・message_stop のイベントをそれぞれのハンドラーへ渡すこと', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([
          encode({ type: 'reasoning_delta', text: '**考え中**\n\n中身' }),
          encode({ type: 'library_title_delta', text: '会議' }),
          encode({ type: 'library_title_delta', text: 'メモ' }),
          encode({ type: 'library_content_delta', text: '# 内容' }),
          encode({ type: 'message_stop', inputTokens: 10, outputTokens: '20' }),
          encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM }),
        ]),
      ),
    );

    const reasoning: string[] = [];
    const title: string[] = [];
    const content: string[] = [];
    const stops: { inputTokens: number; outputTokens: number }[] = [];
    await streamMessageContent(buildFormData(), 'local-1', {
      onReasoningDelta: (text) => reasoning.push(text),
      onLibraryTitleDelta: (text) => title.push(text),
      onLibraryContentDelta: (text) => content.push(text),
      onMessageStop: (payload) => stops.push(payload),
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(reasoning).toEqual(['**考え中**\n\n中身']);
    expect(title).toEqual(['会議', 'メモ']);
    expect(content).toEqual(['# 内容']);
    expect(stops).toEqual([{ inputTokens: 10, outputTokens: 20 }]);
  });

  test('ハンドラー未指定のイベントがあっても最後まで処理できること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([
          encode({ type: 'library_title_delta', text: 'タイトル' }),
          encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM }),
        ]),
      ),
    );

    const result = await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(result.id).toBe('content-1');
  });

  test('1 つのイベントが複数チャンクに分かれても、マルチバイト文字ごと復元すること', async () => {
    const bytes = encode({ type: 'text_delta', text: 'あいう' });
    // 「あ」の途中（UTF-8 の 3 バイトのうち 2 バイト目）で切る
    const cut = bytes.indexOf(0xe3) + 2;
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([
          bytes.slice(0, cut),
          bytes.slice(cut),
          encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM }),
        ]),
      ),
    );

    const deltas: string[] = [];
    await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: (text) => deltas.push(text),
      onMessageContent: () => undefined,
    });

    expect(deltas).toEqual(['あいう']);
  });

  test('末尾が改行で終わらない最後のイベントも処理すること', async () => {
    const last = new TextEncoder().encode(
      `data:${JSON.stringify({ type: 'message_content', data: FIXTURE_FINAL_ITEM })}`,
    );
    server.use(http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () => sseResponse([last])));

    const result = await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: () => undefined,
      onMessageContent: () => undefined,
    });

    expect(result.answer).toBe('最終回答');
  });

  test('message_content の欠けた項目に既定値を入れること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([encode({ type: 'message_content', data: { id: 'c', messageId: 'm' } })]),
      ),
    );

    let received: MessageContentApiItem | null = null;
    await streamMessageContent(buildFormData(), 'local-1', {
      onTextDelta: () => undefined,
      onMessageContent: (item) => {
        received = item;
      },
    });

    expect(received).toMatchObject({
      id: 'c',
      messageId: 'm',
      status: 'OK',
      answer: null,
      attachmentFiles: [],
      isRated: false,
    });
  });

  test('message_content が届かなければエラーを投げること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sseResponse([encode({ type: 'text_delta', text: 'a' })]),
      ),
    );

    await expect(
      streamMessageContent(buildFormData(), 'local-1', {
        onTextDelta: () => undefined,
        onMessageContent: () => undefined,
      }),
    ).rejects.toThrow('ended without message_content');
  });

  test('HTTP エラーはエラーを投げること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        HttpResponse.json({ message: 'x' }, { status: 500 }),
      ),
    );

    await expect(
      streamMessageContent(buildFormData(), 'local-1', {
        onTextDelta: () => undefined,
        onMessageContent: () => undefined,
      }),
    ).rejects.toMatchObject({ status: 500 });
  });

  test('local の送信先には contentUrl・X-Server-Auth-Key で送り、Cookie と X-Tenant-ID は付けないこと', async () => {
    persistTenantId('tenant-1');
    let request: Request | null = null;
    server.use(
      http.post(LOCAL_CONTENT_URL, ({ request: req }) => {
        request = req;
        return sseResponse([encode({ type: 'message_content', data: FIXTURE_FINAL_ITEM })]);
      }),
    );

    const result = await streamMessageContent(
      buildFormData(),
      'local-1',
      { onTextDelta: () => undefined, onMessageContent: () => undefined },
      { kind: 'local', contentUrl: LOCAL_CONTENT_URL, apiKey: 'key-1' },
    );

    expect(request!.headers.get('x-server-auth-key')).toBe('key-1');
    expect(request!.headers.get('accept')).toBe('text/event-stream');
    expect(request!.headers.get('x-tenant-id')).toBeNull();
    expect(request!.credentials).toBe('omit');
    expect(result.answer).toBe('最終回答');
  });
});
