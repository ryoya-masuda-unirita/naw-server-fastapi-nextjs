import { http, HttpResponse } from 'msw';
import { describe, expect, test } from 'vitest';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import type { MessageListAssistant } from '@/types/chat/message-api.type';
import { fetchLibraryBody, fetchLibraryContent } from './library-content-api';

const SECURE_ASSISTANT: MessageListAssistant = {
  id: 'asst-secure',
  type: 'SECURE',
  endpoints: [
    { type: 'LOCAL_SERVER', destination: 'https://local.test/', apiKey: 'local-key', model: 'm-1' },
  ],
};
const NAW_ASSISTANT: MessageListAssistant = {
  id: 'asst-naw',
  type: 'SAAS_CHAT',
  endpoints: [{ type: 'AZURE_OPENAI_CHAT', destination: 'https://azure.example.com/', apiKey: '' }],
};

function mockNawBody(data: string | undefined) {
  server.use(
    http.get(mockPath(API_PATHS.VIEWER.CONTENT(':libraryId')), () => HttpResponse.json({ data })),
  );
}

describe('fetchLibraryBody', () => {
  test('アシスタントがないときは NAW から本文を取得すること', async () => {
    mockNawBody('# naw');
    await expect(fetchLibraryBody('lib-1', null)).resolves.toBe('# naw');
  });

  test('SECURE 以外のアシスタントは NAW から本文を取得すること', async () => {
    mockNawBody('# naw');
    await expect(fetchLibraryBody('lib-1', NAW_ASSISTANT)).resolves.toBe('# naw');
  });

  test('NAW の本文が無いときは空文字を返すこと', async () => {
    mockNawBody(undefined);
    await expect(fetchLibraryBody('lib-1', null)).resolves.toBe('');
  });

  test('SECURE はローカルサーバーから X-Server-Auth-Key 付きで取得すること', async () => {
    let authKey: string | null = null;
    server.use(
      http.get('https://local.test/api/libraries/lib-1/content', ({ request }) => {
        authKey = request.headers.get('X-Server-Auth-Key');
        return HttpResponse.json({ data: '# local' });
      }),
    );
    await expect(fetchLibraryBody('lib-1', SECURE_ASSISTANT)).resolves.toBe('# local');
    expect(authKey).toBe('local-key');
  });

  test('SECURE のエンドポイントが不正なときは理由付きで失敗すること', async () => {
    await expect(
      fetchLibraryBody('lib-1', { id: 'a', type: 'SECURE', endpoints: [] }),
    ).rejects.toThrow('Invalid library content endpoint: no_endpoint');
  });
});

describe('fetchLibraryContent', () => {
  test('詳細のタイトルとローカルの本文を返すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':libraryId')), () =>
        HttpResponse.json({ id: 'lib-1', title: 'タイトル', assistant: SECURE_ASSISTANT }),
      ),
      http.get('https://local.test/api/libraries/lib-1/content', () =>
        HttpResponse.json({ data: '# local' }),
      ),
    );
    await expect(fetchLibraryContent('lib-1')).resolves.toEqual({
      title: 'タイトル',
      data: '# local',
    });
  });

  test('タイトルが null のときは空文字にすること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.LIBRARY.DETAIL(':libraryId')), () =>
        HttpResponse.json({ id: 'lib-1', title: null, assistant: null }),
      ),
    );
    mockNawBody('# naw');
    await expect(fetchLibraryContent('lib-1')).resolves.toEqual({ title: '', data: '# naw' });
  });
});
