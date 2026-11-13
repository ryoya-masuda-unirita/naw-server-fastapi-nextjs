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
  useChatStore.setState({ activeRoomId: null, attachedFiles: [], sharedRoomContext: undefined });
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

  test('startNewChat は添付ファイルも空にすること', () => {
    useChatStore.setState({
      attachedFiles: [{ id: 'f1', name: 'a.txt', type: 'text/plain', size: 1 }],
    });

    useChatStore.getState().startNewChat();

    expect(useChatStore.getState().attachedFiles).toEqual([]);
  });

  test('addAttachment と removeAttachment で添付ファイルを増減できること', () => {
    URL.createObjectURL = () => 'blob:x';
    useChatStore.getState().addAttachment(new File(['a'], 'a.txt', { type: 'text/plain' }));
    const [attachment] = useChatStore.getState().attachedFiles;

    expect(attachment).toMatchObject({ name: 'a.txt', type: 'text/plain', size: 1, url: 'blob:x' });

    useChatStore.getState().removeAttachment(attachment.id);
    expect(useChatStore.getState().attachedFiles).toEqual([]);
  });

  test('clearAttachments は添付ファイルをすべて外すこと', () => {
    useChatStore.setState({
      attachedFiles: [{ id: 'f1', name: 'a.txt', type: 'text/plain', size: 1 }],
    });

    useChatStore.getState().clearAttachments();

    expect(useChatStore.getState().attachedFiles).toEqual([]);
  });

  test('openSharedRoom は自分の一覧にないルームを共有情報から文脈として持ち、メッセージを読み込むこと', async () => {
    let requestedRoomId: string | null = null;
    server.use(
      http.get(mockPath(API_PATHS.MESSAGES.LIST), ({ request }) => {
        requestedRoomId = new URL(request.url).searchParams.get('roomId');
        return HttpResponse.json({ assistants: [], messages: [] });
      }),
    );

    await useChatStore
      .getState()
      .openSharedRoom({ roomId: 'r9', roomName: '共有部屋', isReadOnly: true, teamIds: ['g1'] }, 's9');

    expect(useChatStore.getState().activeRoomId).toBe('r9');
    expect(useChatStore.getState().sharedRoomContext).toMatchObject({
      id: 'r9',
      name: '共有部屋',
      shareId: 's9',
      teamIds: ['g1'],
    });
    expect(requestedRoomId).toBe('r9');
  });

  test('openSharedRoom は自分の一覧にあるルームなら文脈を持たないこと', async () => {
    useRoomsStore.setState({
      allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat' }],
    });

    await useChatStore
      .getState()
      .openSharedRoom({ roomId: 'r1', roomName: '共有部屋', isReadOnly: false, teamIds: [] }, 's1');

    expect(useChatStore.getState().sharedRoomContext).toBeUndefined();
    expect(useChatStore.getState().activeRoomId).toBe('r1');
  });

  test('clearSharedRoomContext は共有ルームの文脈を消すこと', () => {
    useChatStore.setState({
      sharedRoomContext: { id: 'r9', name: '共有', isPinned: false, category: 'chat' },
    });

    useChatStore.getState().clearSharedRoomContext();

    expect(useChatStore.getState().sharedRoomContext).toBeUndefined();
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

  test('一覧になければ共有ルームの文脈を返し、表示中のルームがなければ返さないこと', () => {
    useChatStore.setState({
      activeRoomId: 'r9',
      sharedRoomContext: { id: 'r9', name: '共有部屋', isPinned: false, category: 'chat' },
    });
    const { result, rerender } = renderHook(() => useActiveRoom());
    expect(result.current?.name).toBe('共有部屋');

    useChatStore.setState({ activeRoomId: null });
    rerender();
    expect(result.current).toBeUndefined();
  });
});
