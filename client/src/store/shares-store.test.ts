import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import { server } from '@/test/setup';
import { useChatStore } from './chat-store';
import { useRoomsStore } from './rooms-store';
import { useSharesStore } from './shares-store';
import { useTeamsStore } from './teams-store';

beforeEach(() => {
  useRoomsStore.getState().reset();
  useRoomsStore.setState({
    allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat' }],
  });
  useTeamsStore.setState({ teams: [] });
  useChatStore.setState({ activeRoomId: null, sharedRoomContext: undefined });
});

describe('useSharesStore', () => {
  test('一覧にない共有ルームの文脈にも、共有・解除の結果を反映すること', async () => {
    useChatStore.setState({
      activeRoomId: 'r9',
      sharedRoomContext: { id: 'r9', name: '共有', isPinned: false, category: 'chat', shareId: 's9', teamIds: ['g1'] },
    });

    await useSharesStore.getState().shareRoom('r9', ['g2']);
    expect(useChatStore.getState().sharedRoomContext).toMatchObject({ shareId: 'share-1', teamIds: ['g2'] });

    await useSharesStore.getState().unshareRoom('share-1');
    expect(useChatStore.getState().sharedRoomContext).toMatchObject({ shareId: null, teamIds: [] });
  });

  test('shareRoom は {data} 包みの応答を返し、ルームに共有 ID と共有先を反映すること', async () => {
    const result = await useSharesStore.getState().shareRoom('r1', ['g1']);

    expect(result).toEqual({ id: 'share-1', roomId: 'r1', teamIds: ['g1'] });
    expect(useRoomsStore.getState().allRooms[0]).toMatchObject({ shareId: 'share-1', teamIds: ['g1'] });
    expect(useSharesStore.getState().isSharing).toBe(false);
  });

  test('shareRoom が失敗しても isSharing を戻して例外を伝えること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.SHARES.CREATE), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    await expect(useSharesStore.getState().shareRoom('r1', ['g1'])).rejects.toBeDefined();

    expect(useSharesStore.getState().isSharing).toBe(false);
    expect(useRoomsStore.getState().allRooms[0].shareId).toBeUndefined();
  });

  test('unshareRoom は共有 ID を持つルームの共有を解除すること', async () => {
    useRoomsStore.setState({
      allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat', shareId: 's1', teamIds: ['g1'] }],
    });

    await useSharesStore.getState().unshareRoom('s1');

    expect(useRoomsStore.getState().allRooms[0]).toMatchObject({ shareId: null, teamIds: [] });
    expect(useSharesStore.getState().isUnsharing).toBe(false);
  });

  test('unshareRoom が失敗したらルームを変えずに例外を伝えること', async () => {
    useRoomsStore.setState({
      allRooms: [{ id: 'r1', name: '部屋1', isPinned: false, category: 'chat', shareId: 's1', teamIds: ['g1'] }],
    });
    server.use(
      http.delete(mockPath(API_PATHS.SHARES.DELETE(':shareId')), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    await expect(useSharesStore.getState().unshareRoom('s1')).rejects.toBeDefined();

    expect(useRoomsStore.getState().allRooms[0].shareId).toBe('s1');
    expect(useSharesStore.getState().isUnsharing).toBe(false);
  });

  test('resolveShareAccess は {data} 包みの応答を取り出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.SHARES.ACCESS(':shareId')), () =>
        HttpResponse.json({
          data: { roomId: 'r9', roomName: '共有部屋', isReadOnly: false, teamIds: ['g1'] },
        }),
      ),
    );

    const access = await useSharesStore.getState().resolveShareAccess('s9');

    expect(access).toEqual({ roomId: 'r9', roomName: '共有部屋', isReadOnly: false, teamIds: ['g1'] });
    expect(useSharesStore.getState().isResolvingAccess).toBe(false);
  });
});

describe('useTeamsStore', () => {
  test('loadTeams は {data} 包みの応答から id と name だけを取り出すこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.GROUPS.LIST), () =>
        HttpResponse.json({ data: [{ id: 'g1', name: '営業', extra: 1 }], total: 1 }),
      ),
    );

    await useTeamsStore.getState().loadTeams();

    expect(useTeamsStore.getState().teams).toEqual([{ id: 'g1', name: '営業' }]);
    expect(useTeamsStore.getState().isLoading).toBe(false);
  });

  test('loadTeams は平らな配列の応答も読めること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json([{ id: 'g2', name: '開発' }])),
    );

    await useTeamsStore.getState().loadTeams();

    expect(useTeamsStore.getState().teams).toEqual([{ id: 'g2', name: '開発' }]);
  });

  test('loadTeams が失敗したら一覧を空にすること', async () => {
    useTeamsStore.setState({ teams: [{ id: 'g1', name: '営業' }] });
    server.use(
      http.get(mockPath(API_PATHS.GROUPS.LIST), () =>
        HttpResponse.json({ message: 'error' }, { status: 500 }),
      ),
    );

    await useTeamsStore.getState().loadTeams();

    expect(useTeamsStore.getState().teams).toEqual([]);
    expect(useTeamsStore.getState().isLoading).toBe(false);
  });
});
