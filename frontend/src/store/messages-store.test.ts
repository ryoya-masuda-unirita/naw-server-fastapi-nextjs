import { http, HttpResponse } from 'msw';
import i18next from 'i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { setLibraryStreamBridge, type LibraryStreamBridge } from '@/lib/chat/library-stream-bridge';
import { useToastStore } from '@/components/shared/toast-store';
import { useRoomsStore } from '@/store/rooms-store';
import type {
  MessageContentApiItem,
  MessageListApiItem,
  MessageListAssistant,
  MessagesListApiResponse,
} from '@/types/chat/message-api.type';
import { useMessagesStore, useVersionInfoByMessageId, useVisibleMessages } from './messages-store';

const ROOM_ID = 'room-1';
const NAW_ASSISTANT: MessageListAssistant = {
  id: 'asst-naw',
  type: 'SAAS_CHAT',
  endpoints: [{ type: 'AZURE_OPENAI_CHAT', destination: 'https://azure.example.com/', apiKey: '' }],
};
const SECURE_ASSISTANT: MessageListAssistant = {
  id: 'asst-secure',
  type: 'SECURE',
  endpoints: [{ type: 'LOCAL_SERVER', destination: 'https://local.test/', apiKey: 'local-key', model: 'm-1' }],
};
const SECURE_NO_ENDPOINT: MessageListAssistant = { id: 'asst-bad', type: 'SECURE', endpoints: [] };

function buildRecord(id: string, parentId: string | null, assistantId = NAW_ASSISTANT.id): MessageListApiItem {
  return { id, roomId: ROOM_ID, assistantId, parentId, isRated: false };
}

function buildContent(messageId: string, answer: string, contentId = `c-${messageId}`): MessageContentApiItem {
  return {
    id: contentId,
    messageId,
    status: 'OK',
    question: `質問-${messageId}`,
    answer,
    context: null,
    attachmentFiles: [],
    referencePaths: null,
    isRated: false,
  };
}

function sse(events: unknown[]): Response {
  const body = events.map((e) => `data:${JSON.stringify(e)}\n\n`).join('');
  return new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

function mockListAndContents(list: MessagesListApiResponse, contents: MessageContentApiItem[]) {
  server.use(
    http.get(mockPath(API_PATHS.MESSAGES.LIST), () => HttpResponse.json(list)),
    http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), () => HttpResponse.json(contents)),
  );
}

/** 送信（作成 → SSE）の応答。作成された ID を返す */
function mockSendHandlers(createdId: string, streamEvents: unknown[]) {
  server.use(
    http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text(createdId)),
    http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () => sse(streamEvents)),
  );
}

/**
 * 送信した textData（JSON）を取り出す。jsdom の Blob は fetch に渡すと本文が空になるため、
 * FormData.append に渡された Blob を直接読む。
 */
function captureTextData() {
  let blob: Blob | null = null;
  const original = FormData.prototype.append;
  vi.spyOn(FormData.prototype, 'append').mockImplementation(function (
    this: FormData,
    ...args: Parameters<FormData['append']>
  ) {
    if (args[0] === 'textData') blob = args[1] as Blob;
    return original.apply(this, args);
  });
  return async (): Promise<Record<string, unknown>> =>
    JSON.parse(await blob!.text()) as Record<string, unknown>;
}

function state() {
  return useMessagesStore.getState();
}

beforeAll(async () => {
  // 辞書を読み込まず、t() がキーをそのまま返すようにする
  await i18next.init({ lng: 'cimode' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  state().clearMessages();
  // 送信時にアシスタント情報が無いと一覧を取りに行くため、通常は取得済みの状態から始める
  useMessagesStore.setState({ assistantCatalog: [], assistants: [NAW_ASSISTANT] });
  useRoomsStore.getState().reset();
  useToastStore.getState().clear();
  setLibraryStreamBridge(null);
});

describe('loadMessagesForRoom', () => {
  test('メッセージ一覧と本文を取得して user / assistant のメッセージにすること', async () => {
    mockListAndContents(
      { assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] },
      [buildContent('m1', '回答1')],
    );

    await state().loadMessagesForRoom(ROOM_ID, true);

    expect(state().isLoading).toBe(false);
    expect(state().loadError).toBeNull();
    expect(state().messageRecords).toHaveLength(1);
    expect(state().messages.map((m) => [m.role, m.question || m.answer])).toEqual([
      ['user', '質問-m1'],
      ['assistant', '回答1'],
    ]);
  });

  test('メッセージが無ければ空になること', async () => {
    mockListAndContents({ assistants: [], messages: [] }, []);
    await state().loadMessagesForRoom(ROOM_ID);
    expect(state().messages).toEqual([]);
    expect(state().loadError).toBeNull();
  });

  test('403 のときは forbidden、それ以外は general になること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () => new HttpResponse(null, { status: 403 })),
    );
    await state().loadMessagesForRoom(ROOM_ID);
    expect(state().loadError).toBe('forbidden');

    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () => new HttpResponse(null, { status: 500 })),
    );
    await state().loadMessagesForRoom(ROOM_ID);
    expect(state().loadError).toBe('general');
  });

  test('本文の取得に失敗したメッセージは ERROR にして、取得失敗のトーストで知らせること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({ assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] }),
      ),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), () => new HttpResponse(null, { status: 500 })),
    );

    await state().loadMessagesForRoom(ROOM_ID);

    expect(state().messages.find((m) => m.role === 'assistant')?.status).toBe('ERROR');
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'CHAT.MESSAGES.LOCAL_FETCH_FAILED',
    ]);
  });

  test('SECURE のメッセージはローカルサーバーから本文を取得すること', async () => {
    let authKey: string | null = null;
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({
          assistants: [SECURE_ASSISTANT],
          messages: [buildRecord('m1', null, SECURE_ASSISTANT.id)],
        }),
      ),
      http.post('https://local.test/api/messages/contents', ({ request }) => {
        authKey = request.headers.get('x-server-auth-key');
        return HttpResponse.json([buildContent('m1', 'ローカル回答')]);
      }),
    );

    await state().loadMessagesForRoom(ROOM_ID);

    expect(authKey).toBe('local-key');
    expect(state().messages.find((m) => m.role === 'assistant')?.answer).toBe('ローカル回答');
  });
});

describe('sendMessage', () => {
  test('送信するとストリーミングで回答が更新され、最終の内容に置き換わること', async () => {
    mockSendHandlers('m-new', [
      { type: 'text_delta', text: '回' },
      { type: 'text_delta', text: '答' },
      { type: 'message_content', data: buildContent('m-new', '回答', 'c-new') },
    ]);

    await state().sendMessage('こんにちは', undefined, ROOM_ID, [], { assistantId: NAW_ASSISTANT.id });

    expect(state().isGenerating).toBe(false);
    expect(state().messageRecords).toEqual([
      expect.objectContaining({ id: 'm-new', roomId: ROOM_ID, assistantId: NAW_ASSISTANT.id, parentId: null }),
    ]);
    const [user, assistant] = state().messages;
    expect(user).toMatchObject({ id: 'm-new', messageId: 'm-new', role: 'user', question: 'こんにちは' });
    expect(assistant).toMatchObject({ id: 'c-new', messageId: 'm-new', role: 'assistant', answer: '回答', status: 'OK' });
  });

  test('2 通目は直前のメッセージを親にして送ること', async () => {
    mockSendHandlers('m1', [{ type: 'message_content', data: buildContent('m1', 'a1', 'c1') }]);
    await state().sendMessage('1通目', undefined, ROOM_ID, [], {});
    mockSendHandlers('m2', [{ type: 'message_content', data: buildContent('m2', 'a2', 'c2') }]);
    await state().sendMessage('2通目', undefined, ROOM_ID, [], {});

    expect(state().messageRecords.map((r) => [r.id, r.parentId])).toEqual([
      ['m1', null],
      ['m2', 'm1'],
    ]);
  });

  test('作成 API の本文に tools・テンプレート・ライブラリ生成を載せること', async () => {
    let createBody: Record<string, unknown> | null = null;
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), async ({ request }) => {
        createBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.text('m1');
      }),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () =>
        sse([{ type: 'message_content', data: buildContent('m1', 'a', 'c1') }]),
      ),
    );

    await state().sendMessage('調べて', undefined, ROOM_ID, [], {
      assistantId: NAW_ASSISTANT.id,
      useWebSearch: true,
      additionalPrompt: 'テンプレート',
      createLibrary: true,
    });

    expect(createBody).toMatchObject({
      roomId: ROOM_ID,
      assistantId: NAW_ASSISTANT.id,
      messageText: '調べて',
      tools: [{ name: 'web_search' }],
      promptTemplateContent: 'テンプレート',
      isCreateLibrary: true,
    });
  });

  test('空の入力で添付も無ければ何もしないこと', async () => {
    await state().sendMessage('  ', undefined, ROOM_ID, []);
    expect(state().messages).toEqual([]);
  });

  test('作成 API が失敗したら assistant を ERROR にして、生成中を解除すること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => new HttpResponse(null, { status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await state().sendMessage('こんにちは', undefined, ROOM_ID, []);

    expect(state().isGenerating).toBe(false);
    expect(state().messages.find((m) => m.role === 'assistant')?.status).toBe('ERROR');
  });

  test('SSE が message_content なしで終わったら assistant を ERROR にすること', async () => {
    mockSendHandlers('m1', [{ type: 'text_delta', text: 'a' }]);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await state().sendMessage('こんにちは', undefined, ROOM_ID, []);

    expect(state().messages.find((m) => m.role === 'assistant')?.status).toBe('ERROR');
  });

  test('最初のメッセージで仮のルーム名を、メッセージ内容から作った名前に変えること', async () => {
    useRoomsStore.setState({
      allRooms: [{ id: ROOM_ID, name: '', isPinned: false, category: 'chat' }],
    });
    let renameBody: unknown = null;
    server.use(
      http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), async ({ request }) => {
        renameBody = await request.json();
        return HttpResponse.json({
          id: ROOM_ID, name: 'こんにちは', pinned: false, createdAt: '', updatedAt: '',
          tenantId: 't', userId: 'u', rating: null, shareUrl: null,
        });
      }),
    );
    mockSendHandlers('m1', [{ type: 'message_content', data: buildContent('m1', 'a', 'c1') }]);

    await state().sendMessage('こんにちは', undefined, ROOM_ID, []);
    await vi.waitFor(() => expect(renameBody).toEqual({ name: 'こんにちは' }));
    await vi.waitFor(() =>
      expect(useRoomsStore.getState().allRooms[0].name).toBe('こんにちは'),
    );
  });

  test('reasoning_delta を見出しごとのセクションにして反映すること', async () => {
    mockSendHandlers('m1', [
      { type: 'reasoning_delta', text: '**調べる**\n\n詳細' },
      { type: 'message_content', data: buildContent('m1', 'a', 'c1') },
    ]);
    const seen: (string | undefined)[] = [];
    const unsubscribe = useMessagesStore.subscribe((s) => {
      seen.push(s.messages.find((m) => m.role === 'assistant')?.reasoning?.sections[0]?.summary);
    });

    await state().sendMessage('q', undefined, ROOM_ID, []);
    unsubscribe();

    expect(seen).toContain('調べる');
  });

  test('ライブラリ生成中はビューワーの窓口へタイトルと本文を流し、最後に終了を知らせること', async () => {
    const calls: string[] = [];
    const bridge: LibraryStreamBridge = {
      beginLibraryStream: () => {
        calls.push('begin');
        return 7;
      },
      appendLibraryTitleDelta: (token, text) => calls.push(`title:${token}:${text}`),
      appendLibraryContentDelta: (token, text) => calls.push(`content:${token}:${text}`),
      abortLibraryStream: () => {
        calls.push('abort');
      },
      endLibraryStream: (token, roomId) => {
        calls.push(`end:${token}:${roomId}`);
      },
    };
    setLibraryStreamBridge(bridge);
    mockSendHandlers('m1', [
      { type: 'library_title_delta', text: '題' },
      { type: 'library_content_delta', text: '本文' },
      { type: 'message_content', data: buildContent('m1', 'a', 'c1') },
    ]);

    await state().sendMessage('まとめて', undefined, ROOM_ID, [], { createLibrary: true });

    expect(calls).toEqual(['begin', 'title:7:題', 'content:7:本文', `end:7:${ROOM_ID}`]);
  });

  test('SECURE アシスタントの接続情報が不正なら、トーストを出して assistant を ERROR にすること', async () => {
    useMessagesStore.setState({ assistants: [SECURE_NO_ENDPOINT] });
    server.use(http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text('m1')));

    await state().sendMessage('q', undefined, ROOM_ID, [], { assistantId: SECURE_NO_ENDPOINT.id });

    expect(state().messages.find((m) => m.role === 'assistant')?.status).toBe('ERROR');
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'CHAT.MESSAGES.LOCAL_ENDPOINT_INVALID',
    ]);
  });

  test('SECURE アシスタントはトークン付きの textData をローカルサーバーへ送ること', async () => {
    useMessagesStore.setState({ assistants: [SECURE_ASSISTANT] });
    sessionStorage.setItem('TENANT_ID', 'tenant-1');
    const readSent = captureTextData();
    let tenantHeader: string | null = 'unset';
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text('m1')),
      http.get(mockPath(API_PATHS.AUTH.SESSION), () => HttpResponse.json({ token: 'waha-token' })),
      http.post('https://local.test/api/messages/content', async ({ request }) => {
        tenantHeader = request.headers.get('x-tenant-id');
        return sse([{ type: 'message_content', data: buildContent('m1', 'ローカル', 'c1') }]);
      }),
    );

    await state().sendMessage('q', undefined, ROOM_ID, [], { assistantId: SECURE_ASSISTANT.id });

    expect(await readSent()).toMatchObject({ assistantId: 'm-1', accessToken: 'waha-token', tenantId: 'tenant-1' });
    expect(tenantHeader).toBeNull();
    expect(state().messages.find((m) => m.role === 'assistant')?.answer).toBe('ローカル');
  });

  test('SECURE でトークンが取れなければ LOCAL_FETCH_FAILED のトーストを出すこと', async () => {
    useMessagesStore.setState({ assistants: [SECURE_ASSISTANT] });
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text('m1')),
      http.get(mockPath(API_PATHS.AUTH.SESSION), () => HttpResponse.json({ id: 'u' })),
    );

    await state().sendMessage('q', undefined, ROOM_ID, [], { assistantId: SECURE_ASSISTANT.id });

    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
      'CHAT.MESSAGES.LOCAL_FETCH_FAILED',
    ]);
  });

  test('includeHistory のアシスタントには、これまでのやり取りを historyMessages で送ること', async () => {
    useMessagesStore.setState({
      assistants: [{ ...NAW_ASSISTANT, includeHistory: true }],
      messageRecords: [buildRecord('m1', null)],
      messages: [
        { id: 'm1', messageId: 'm1', role: 'user', status: 'COMPLETE', question: '前の質問', answer: '', context: '', isRated: false },
        { id: 'c1', messageId: 'm1', role: 'assistant', status: 'OK', question: '', answer: '前の回答', context: '', isRated: false },
      ],
    });
    const readSent = captureTextData();
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text('m2')),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), async () => {
        return sse([{ type: 'message_content', data: buildContent('m2', 'a', 'c2') }]);
      }),
    );

    await state().sendMessage('次の質問', undefined, ROOM_ID, [], { assistantId: NAW_ASSISTANT.id });

    expect(await readSent()).toMatchObject({
      historyMessages: [
        { type: 'USER', content: '前の質問', attachmentsCount: 0 },
        { type: 'ASSISTANT', content: '前の回答', attachmentsCount: 0 },
      ],
    });
  });
});

describe('再生成', () => {
  async function loadOneTurn() {
    mockListAndContents(
      { assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] },
      [buildContent('m1', '古い回答', 'c1')],
    );
    await state().loadMessagesForRoom(ROOM_ID);
  }

  test('同じ messageContentId で再送して回答を置き換えること', async () => {
    await loadOneTurn();
    const readSent = captureTextData();
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), async () => {
        return sse([
          { type: 'text_delta', text: '新しい' },
          { type: 'message_content', data: buildContent('m1', '新しい回答', 'c1') },
        ]);
      }),
    );

    await state().regenerateMessage('c1');

    expect(await readSent()).toMatchObject({ messageId: 'm1', messageContentId: 'c1', userInput: '質問-m1' });
    expect(state().messages.find((m) => m.id === 'c1')?.answer).toBe('新しい回答');
  });

  test('web 検索で再回答すると tools に web_search だけを付けること', async () => {
    await loadOneTurn();
    const readSent = captureTextData();
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), async () => {
        return sse([{ type: 'message_content', data: buildContent('m1', 'a', 'c1') }]);
      }),
    );

    await state().webSearchRetryMessage('c1');

    expect(await readSent()).toMatchObject({ tools: [{ name: 'web_search' }] });
  });

  test('失敗したら回答を ERROR にすること', async () => {
    await loadOneTurn();
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CONTENT), () => new HttpResponse(null, { status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await state().retryMessage('c1');

    expect(state().messages.find((m) => m.id === 'c1')?.status).toBe('ERROR');
    expect(state().isGenerating).toBe(false);
  });

  test('対象が無ければ何もしないこと', async () => {
    await state().regenerateMessage('unknown');
    expect(state().isGenerating).toBe(false);
  });
});

describe('editMessage とバージョン切り替え', () => {
  async function loadOneTurn() {
    mockListAndContents(
      { assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] },
      [buildContent('m1', '元の回答', 'c1')],
    );
    await state().loadMessagesForRoom(ROOM_ID);
  }

  test('編集すると同じ親の新しい版が増え、それが表示されること', async () => {
    await loadOneTurn();
    mockSendHandlers('m2', [{ type: 'message_content', data: buildContent('m2', '編集後の回答', 'c2') }]);

    await state().editMessage('m1', '編集後の質問', ROOM_ID);

    expect(state().messageRecords.map((r) => [r.id, r.parentId])).toEqual([
      ['m1', null],
      ['m2', null],
    ]);
    const { result } = renderHook(() => useVisibleMessages());
    expect(result.current.map((m) => m.question || m.answer)).toEqual(['編集後の質問', '編集後の回答']);
  });

  test('prev / next で版を切り替えられ、端では動かないこと', async () => {
    await loadOneTurn();
    mockSendHandlers('m2', [{ type: 'message_content', data: buildContent('m2', '編集後', 'c2') }]);
    await state().editMessage('m1', '編集後の質問', ROOM_ID);
    const versionInfo = renderHook(() => useVersionInfoByMessageId());
    const visible = renderHook(() => useVisibleMessages());
    const groupKey = '__root__';

    expect(versionInfo.result.current.get('m2')).toMatchObject({ current: 2, total: 2, canPrev: true, canNext: false });

    state().switchVersion(groupKey, 'next');
    expect(state().activeVersionIndex.get(groupKey)).toBe(1);

    state().switchVersion(groupKey, 'prev');
    versionInfo.rerender();
    visible.rerender();
    expect(state().activeVersionIndex.get(groupKey)).toBe(0);
    expect(visible.result.current.map((m) => m.answer || m.question)).toEqual(['質問-m1', '元の回答']);
    expect(versionInfo.result.current.get('m1')).toMatchObject({ current: 1, total: 2 });
  });

  test('編集の送信に失敗したら、編集前の状態に戻すこと', async () => {
    await loadOneTurn();
    const before = { messages: state().messages, records: state().messageRecords };
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => new HttpResponse(null, { status: 500 })),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await state().editMessage('m1', '編集後の質問', ROOM_ID);

    expect(state().messages).toEqual(before.messages);
    expect(state().messageRecords).toEqual(before.records);
    expect(state().isGenerating).toBe(false);
  });

  test('assistant のメッセージや空の本文は編集しないこと', async () => {
    await loadOneTurn();
    await state().editMessage('c1', 'x', ROOM_ID);
    await state().editMessage('m1', '  ', ROOM_ID);
    expect(state().messageRecords).toHaveLength(1);
  });
});

describe('deleteMessage / rateMessage', () => {
  test('削除すると配下のメッセージも消え、版の位置を直すこと', async () => {
    mockListAndContents(
      {
        assistants: [NAW_ASSISTANT],
        messages: [buildRecord('m1', null), buildRecord('m2', 'm1'), buildRecord('m3', null)],
      },
      [buildContent('m1', 'a1', 'c1'), buildContent('m2', 'a2', 'c2'), buildContent('m3', 'a3', 'c3')],
    );
    await state().loadMessagesForRoom(ROOM_ID);
    server.use(http.delete(mockPath(API_PATHS.MESSAGES.DETAIL(':id')), () => new HttpResponse(null, { status: 204 })));

    await state().deleteMessage('m1');

    expect(state().messageRecords.map((r) => r.id)).toEqual(['m3']);
    expect(state().messages.every((m) => m.messageId === 'm3')).toBe(true);
    expect(state().activeVersionIndex.size).toBe(0);
  });

  test('削除に失敗したらエラーを投げ、メッセージはそのままにすること', async () => {
    mockListAndContents({ assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] }, [buildContent('m1', 'a')]);
    await state().loadMessagesForRoom(ROOM_ID);
    server.use(http.delete(mockPath(API_PATHS.MESSAGES.DETAIL(':id')), () => new HttpResponse(null, { status: 500 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(state().deleteMessage('m1')).rejects.toMatchObject({ status: 500 });
    expect(state().messageRecords).toHaveLength(1);
  });

  test('評価すると先に画面へ反映し、失敗したら元に戻すこと', async () => {
    mockListAndContents({ assistants: [NAW_ASSISTANT], messages: [buildRecord('m1', null)] }, [buildContent('m1', 'a')]);
    await state().loadMessagesForRoom(ROOM_ID);

    server.use(http.post(mockPath(API_PATHS.MESSAGES.FEEDBACK(':id')), () => new HttpResponse(null, { status: 204 })));
    await state().rateMessage('m1', 'GOOD');
    expect(state().messages.every((m) => m.isRated && m.rating === 'GOOD')).toBe(true);
    expect(state().messageRecords[0]).toMatchObject({ isRated: true, rating: 'GOOD' });

    useMessagesStore.getState().clearMessages();
    await state().loadMessagesForRoom(ROOM_ID);
    server.use(http.post(mockPath(API_PATHS.MESSAGES.FEEDBACK(':id')), () => new HttpResponse(null, { status: 500 })));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(state().rateMessage('m1', 'BAD')).rejects.toMatchObject({ status: 500 });
    expect(state().messageRecords[0].isRated).toBe(false);
  });

describe('古い読み込みの応答', () => {
  test('ルームを切り替えたあとに届いた前のルームの応答は捨てること', async () => {
    let releaseSlow: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), async ({ request }) => {
        const roomId = new URL(request.url).searchParams.get('roomId');
        if (roomId === 'room-a') await slow;
        return HttpResponse.json({
          assistants: [NAW_ASSISTANT],
          messages: [buildRecord(roomId === 'room-a' ? 'ma' : 'mb', null)],
        });
      }),
      http.post(mockPath(API_PATHS.MESSAGES.CONTENTS), async ({ request }) => {
        const body = (await request.json()) as { messageIds: string[] };
        return HttpResponse.json(body.messageIds.map((id) => buildContent(id, `回答-${id}`)));
      }),
    );

    const loadingA = state().loadMessagesForRoom('room-a', true);
    await state().loadMessagesForRoom('room-b', true);
    releaseSlow();
    await loadingA;

    expect(state().messageRecords.map((r) => r.id)).toEqual(['mb']);
    expect(state().isLoading).toBe(false);
  });
});

});
