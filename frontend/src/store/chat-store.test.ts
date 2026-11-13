import { renderHook } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { useChatStore, useActiveRoom } from './chat-store';
import { useMessagesStore } from './messages-store';
import { useRoomsStore } from './rooms-store';

beforeEach(() => {
  useChatStore.setState({ activeRoomId: null });
  useMessagesStore.getState().clearMessages();
  useRoomsStore.getState().reset();
});

describe('useChatStore', () => {
  test('setActiveRoomId はメッセージを読み込まずにルームだけ切り替えること', () => {
    let requested = false;
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), () => {
        requested = true;
        return HttpResponse.json({ assistants: [], messages: [] });
      }),
    );

    useChatStore.getState().setActiveRoomId('r1');

    expect(useChatStore.getState().activeRoomId).toBe('r1');
    expect(requested).toBe(false);
  });

  test('selectRoom はルームを切り替えてメッセージを読み込むこと', async () => {
    let requestedRoomId: string | null = null;
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), ({ request }) => {
        requestedRoomId = new URL(request.url).searchParams.get('roomId');
        return HttpResponse.json({ assistants: [], messages: [] });
      }),
    );

    useChatStore.getState().selectRoom('r2');

    expect(useChatStore.getState().activeRoomId).toBe('r2');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(requestedRoomId).toBe('r2');
  });

  test('startNewChat はルームとメッセージを空にすること', () => {
    useChatStore.setState({ activeRoomId: 'r1' });
    useMessagesStore.setState({ isLoading: true });

    useChatStore.getState().startNewChat();

    expect(useChatStore.getState().activeRoomId).toBeNull();
    expect(useMessagesStore.getState().messages).toEqual([]);
    expect(useMessagesStore.getState().isLoading).toBe(false);
  });
});

describe('useActiveRoom', () => {
  test('ルーム一覧にある表示中のルームを返し、なければ undefined になること', () => {
    useRoomsStore.setState({
      allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat' }],
    });
    const { result, rerender } = renderHook(() => useActiveRoom());
    expect(result.current).toBeUndefined();

    useChatStore.setState({ activeRoomId: 'r1' });
    rerender();
    expect(result.current?.name).toBe('部屋1');

    useChatStore.setState({ activeRoomId: 'missing' });
    rerender();
    expect(result.current).toBeUndefined();
  });
});
