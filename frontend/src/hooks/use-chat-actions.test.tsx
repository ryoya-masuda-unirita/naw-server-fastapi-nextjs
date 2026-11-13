import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { useMessagesStore } from '@/store/messages-store';
import { useRoomsStore } from '@/store/rooms-store';
import { useChatActions } from './use-chat-actions';

const FIXTURE_ASSISTANT = {
  id: 'a1',
  tenantId: 't',
  type: 'SAAS_CHAT',
  endpoints: [],
  name: 'アシスタント1',
  indexId: null,
  category: null,
  groups: [],
  description: '',
  includeHistory: false,
  iconColor: '',
};

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useChatActions(), { wrapper }) };
}

beforeEach(() => {
  server.use(
    http.get(mockPath(API_PATHS.ASSISTANTS.LIST), () => HttpResponse.json([FIXTURE_ASSISTANT])),
  );
  useMessagesStore.getState().clearMessages();
  useMessagesStore.setState({ assistantCatalog: [] });
  useRoomsStore.getState().reset();
});

describe('useChatActions', () => {
  test('アシスタント一覧を取得したら messages store に渡すこと', async () => {
    setup();

    await waitFor(() => expect(useMessagesStore.getState().assistantCatalog.map((a) => a.id)).toEqual(['a1']));
  });

  test('新規ルーム作成にアシスタント名を渡すこと', async () => {
    let body: unknown = null;
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: 'new', name: 'アシスタント1' });
      }),
    );
    const { result } = setup();
    await waitFor(() => expect(useMessagesStore.getState().assistantCatalog).toHaveLength(1));

    let id: string | null = null;
    await act(async () => {
      id = await result.current.createNewRoom('a1');
    });

    expect(id).toBe('new');
    expect(body).toEqual({ name: 'アシスタント1', assistantId: 'a1' });
  });

  test('メッセージを評価したら、フィードバック一覧の query を無効化すること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.MESSAGES.FEEDBACK(':id')), () => new HttpResponse(null, { status: 204 })),
    );
    const { result, queryClient } = setup();
    queryClient.setQueryData(['feedback', 'accuracy', 1], 'x');
    queryClient.setQueryData(['feedback', 'satisfaction', 1], 'y');

    await act(async () => {
      await result.current.rateMessage('m1', 'GOOD');
    });

    expect(queryClient.getQueryState(['feedback', 'accuracy', 1])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['feedback', 'satisfaction', 1])?.isInvalidated).toBe(false);
  });

  test('ルームを評価したら、ルームの評価を更新すること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.FEEDBACK(':roomId')), () => new HttpResponse(null, { status: 204 })),
    );
    useRoomsStore.setState({ allRooms: [{ id: 'r1', name: 'n', isPinned: false, category: 'chat' }] });
    const { result } = setup();

    await act(async () => {
      await result.current.submitRoomFeedback('r1', { rating: 'GOOD' });
    });

    expect(useRoomsStore.getState().allRooms[0].rating).toBe('GOOD');
  });
});
