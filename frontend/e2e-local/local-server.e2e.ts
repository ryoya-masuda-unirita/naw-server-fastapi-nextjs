import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import i18next from 'i18next';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { fetchLibraryBody } from '@/lib/chat/library-content-api';
import { useMessagesStore } from '@/store/messages-store';
import type { MessageListAssistant } from '@/types/chat/message-api.type';

// 実際の server-local（onprem/ の docker compose。ポート 18090）と Echo プロバイダーのエミュレーターに対して、
// SECURE アシスタントの送信・ライブラリ本文の取得を通す。backend（NAW）の応答だけ MSW で用意する。
const LOCAL_URL = process.env.LOCAL_SERVER_URL ?? 'http://localhost:18090/';
const LOCAL_KEY = process.env.LOCAL_SERVER_KEY ?? 'onprem-local-key';
const ORIGIN = 'http://localhost:5173';
const ROOM_ID = 'room-1';
const QUESTION = 'こんにちは、通しの確認です';

const SECURE_ASSISTANT: MessageListAssistant = {
  id: 'asst-secure',
  type: 'SECURE',
  endpoints: [
    { type: 'LOCAL_SERVER', destination: LOCAL_URL, apiKey: LOCAL_KEY, model: 'onprem-chat' },
  ],
};

const mswServer = setupServer(
  // server-local は message_id を一意として保存するため、実行ごとに変える
  http.post(mockPath(API_PATHS.MESSAGES.CREATE), () => HttpResponse.text(`m-${Date.now()}`)),
  http.get(mockPath(API_PATHS.AUTH.SESSION), () => HttpResponse.json({ token: 'e2e-waha-token' })),
);

beforeAll(async () => {
  await i18next.init({ lng: 'cimode' });
  // server-local への通信は実物へ通す
  mswServer.listen({ onUnhandledRequest: 'bypass' });
});
afterAll(() => mswServer.close());

describe('server-local との通し', () => {
  test('ブラウザの preflight が X-Server-Auth-Key と X-Tenant-ID を許可すること', async () => {
    const res = await fetch(`${LOCAL_URL}api/messages/content`, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'x-server-auth-key,x-tenant-id,accept',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(res.headers.get('access-control-allow-headers')).toContain('x-server-auth-key');
  });

  test('SECURE アシスタントへの質問が server-local から SSE で返ること', async () => {
    useMessagesStore.getState().clearMessages();
    useMessagesStore.setState({ assistantCatalog: [], assistants: [SECURE_ASSISTANT] });

    await useMessagesStore
      .getState()
      .sendMessage(QUESTION, undefined, ROOM_ID, [], { assistantId: SECURE_ASSISTANT.id });

    const assistant = useMessagesStore.getState().messages.find((m) => m.role === 'assistant');
    console.log('assistant message:', JSON.stringify(assistant));
    expect(assistant?.status).not.toBe('ERROR');
    expect(assistant?.answer).toContain(QUESTION);
  });

  test('送信した会話をルームの読み込みで server-local から取得し直せること', async () => {
    const sentRecordId = useMessagesStore.getState().messageRecords.at(-1)?.id;
    const sentMessageId = useMessagesStore.getState().messages.at(-1)?.messageId;
    const recordId = sentRecordId ?? sentMessageId ?? '';
    mswServer.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
        HttpResponse.json({
          assistants: [SECURE_ASSISTANT],
          messages: [
            { id: recordId, roomId: ROOM_ID, assistantId: SECURE_ASSISTANT.id, parentId: null, isRated: false },
          ],
        }),
      ),
    );
    useMessagesStore.getState().clearMessages();

    await useMessagesStore.getState().loadMessagesForRoom(ROOM_ID, true);

    const { messages, loadError } = useMessagesStore.getState();
    console.log('reloaded:', JSON.stringify(messages.map((m) => [m.role, m.status, m.question || m.answer])));
    expect(loadError).toBeNull();
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[0].question).toBe(QUESTION);
    expect(messages[1].answer).toContain(QUESTION);
  });

  test('認証キーが違うと 401 になりライブラリ本文を取得できないこと', async () => {
    await expect(
      fetchLibraryBody('lib-x', {
        ...SECURE_ASSISTANT,
        endpoints: [{ ...SECURE_ASSISTANT.endpoints[0], apiKey: 'wrong-key' }],
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
