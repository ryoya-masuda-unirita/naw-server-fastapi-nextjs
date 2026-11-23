import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import type { MessageContentApiItem, MessageListApiItem } from '@/types/chat/message-api.type';

const fetchMessageContents = vi.hoisted(() => vi.fn());
vi.mock('@/lib/chat/message-contents-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/chat/message-contents-api')>()),
  fetchMessageContents,
}));

import { fetchRoomContents, RoomLearningError } from './room-learning-contents';

function record(id: string, parentId: string | null): MessageListApiItem {
  return { id, roomId: 'room-1', assistantId: 'a1', parentId, isRated: false };
}

function content(messageId: string, status = 'OK'): MessageContentApiItem {
  return {
    id: `c-${messageId}`,
    messageId,
    status,
    question: `Q-${messageId}`,
    answer: `A-${messageId}`,
    context: null,
    isRated: false,
  } as MessageContentApiItem;
}

function serveMessages(messages: MessageListApiItem[]) {
  server.use(
    http.get(mockPath(API_PATHS.MESSAGES.LIST), () =>
      HttpResponse.json({ assistants: [], messages }),
    ),
  );
}

async function reasonOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof RoomLearningError ? error.reason : `other:${String(error)}`;
  }
  return undefined;
}

describe('fetchRoomContents', () => {
  beforeEach(() => {
    fetchMessageContents.mockReset();
  });

  test('only the visible thread is passed to the content fetch', async () => {
    // m1 を編集した m1b と、その子 m3 が最新の版。古い版（m1・m2）の本文は取らない
    serveMessages([
      record('m1', null),
      record('m2', 'm1'),
      record('m1b', null),
      record('m3', 'm1b'),
    ]);
    fetchMessageContents.mockResolvedValue({
      contents: [content('m1b'), content('m3')],
      failures: [],
    });

    const contents = await fetchRoomContents('room-1');

    expect(contents.map((c) => c.messageId)).toEqual(['m1b', 'm3']);
    const passed = fetchMessageContents.mock.calls[0][0] as {
      messages: MessageListApiItem[];
    };
    expect(passed.messages.map((m) => m.id)).toEqual(['m1b', 'm3']);
  });

  test('room without messages is rejected as empty without fetching contents', async () => {
    serveMessages([]);

    expect(await reasonOf(fetchRoomContents('room-1'))).toBe('empty');
    expect(fetchMessageContents).not.toHaveBeenCalled();
  });

  test('error status content is rejected as missing', async () => {
    serveMessages([record('m1', null)]);
    fetchMessageContents.mockResolvedValue({
      contents: [content('m1', 'ERROR')],
      failures: [],
    });

    expect(await reasonOf(fetchRoomContents('room-1'))).toBe('missing');
  });

  test('fewer contents than messages is rejected as missing', async () => {
    // 削除されたローカルのアシスタントの本文は、失敗にも数えられずに返らない
    serveMessages([record('m1', null), record('m2', 'm1')]);
    fetchMessageContents.mockResolvedValue({
      contents: [content('m1')],
      failures: [],
    });

    expect(await reasonOf(fetchRoomContents('room-1'))).toBe('missing');
  });

  test('failure other than fetch_failed is rejected as missing', async () => {
    serveMessages([record('m1', null)]);
    fetchMessageContents.mockResolvedValue({
      contents: [content('m1', 'ERROR')],
      failures: [{ messageIds: ['m1'], reason: 'assistant_not_found' }],
    });

    expect(await reasonOf(fetchRoomContents('room-1'))).toBe('missing');
  });

  test('fetch_failed failures are rejected as missing so the user is told', async () => {
    // 通信の失敗は fetchMessageContents が握るため、ここで伝えないと何も表示されない
    serveMessages([record('m1', null)]);
    fetchMessageContents.mockResolvedValue({
      contents: [content('m1', 'ERROR')],
      failures: [{ messageIds: ['m1'], reason: 'fetch_failed' }],
    });

    expect(await reasonOf(fetchRoomContents('room-1'))).toBe('missing');
  });
});
