import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import type { MessageListAssistant } from '@/types/chat/message-api.type';
import { deleteLocalLibraryCopy, resolveLocalLibraryTarget } from './library-local-copy';

const LOCAL_URL = 'https://local.example.com/api/libraries/l1';

const FIXTURE_SECURE_ASSISTANT: MessageListAssistant = {
  id: 'a1',
  type: 'SECURE',
  endpoints: [
    { type: 'LOCAL_SERVER', destination: 'https://local.example.com', apiKey: 'secret' },
  ],
};

describe('resolveLocalLibraryTarget', () => {
  test('SECURE アシスタントのローカルサーバーを削除先にすること', () => {
    expect(resolveLocalLibraryTarget('l1', FIXTURE_SECURE_ASSISTANT)).toEqual({
      url: LOCAL_URL,
      apiKey: 'secret',
    });
  });

  test('アシスタントがない・SECURE でないときは削除先なしとすること', () => {
    expect(resolveLocalLibraryTarget('l1', null)).toBeNull();
    expect(resolveLocalLibraryTarget('l1', { ...FIXTURE_SECURE_ASSISTANT, type: 'NORMAL' })).toBeNull();
  });

  test('接続先や API キーが空なら削除先なしとすること', () => {
    const withoutKey = {
      ...FIXTURE_SECURE_ASSISTANT,
      endpoints: [{ type: 'LOCAL_SERVER', destination: 'https://local.example.com', apiKey: ' ' }],
    };
    expect(resolveLocalLibraryTarget('l1', withoutKey)).toBeNull();
  });
});

describe('deleteLocalLibraryCopy', () => {
  test('認証ヘッダーを付けてローカルサーバーへ削除を送ること', async () => {
    let authKey: string | null = null;
    server.use(
      http.delete(LOCAL_URL, ({ request }) => {
        authKey = request.headers.get('X-Server-Auth-Key');
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await deleteLocalLibraryCopy('l1', FIXTURE_SECURE_ASSISTANT);

    expect(authKey).toBe('secret');
  });

  test('ローカルサーバーが失敗しても投げないこと', async () => {
    server.use(http.delete(LOCAL_URL, () => HttpResponse.json({}, { status: 500 })));

    await expect(deleteLocalLibraryCopy('l1', FIXTURE_SECURE_ASSISTANT)).resolves.toBeUndefined();
  });
});
