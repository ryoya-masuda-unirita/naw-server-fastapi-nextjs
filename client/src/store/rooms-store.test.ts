import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, test } from 'vitest';
import { server } from '@/test/setup';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';
import type { Assistant } from '@/types/chat/assistant.type';
import type { ChatRoom, RoomListApiItem } from '@/types/chat/chat-room.type';
import { selectPinnedRooms, useRoomsStore } from './rooms-store';

function buildApiRoom(id: string, overrides: Partial<RoomListApiItem> = {}): RoomListApiItem {
  return {
    id,
    name: `room-${id}`,
    pinned: false,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    tenantId: 't1',
    userId: 'u1',
    rating: null,
    shareUrl: null,
    ...overrides,
  };
}

function buildRoom(id: string, overrides: Partial<ChatRoom> = {}): ChatRoom {
  return { id, name: `room-${id}`, isPinned: false, category: 'chat', ...overrides };
}

const FIXTURE_ASSISTANTS: Assistant[] = [
  { id: 'a1', name: 'アシスタント1', description: '', category: '', model: '' },
];

function state() {
  return useRoomsStore.getState();
}

beforeEach(() => {
  state().reset();
});

describe('getAllRooms / loadNextRoomsPage', () => {
  test('1 ページ目を読み込み、全件が揃えば続きは無いこと', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({ content: [buildApiRoom('r1'), buildApiRoom('r2')], totalElements: 2, number: 0, size: 20 }),
      ),
    );

    await state().getAllRooms();

    expect(state().allRooms.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(state().allRoomsHasMore).toBe(false);
    expect(state().isAllRoomsLoading).toBe(false);
  });

  test('続きがあるときは次のページを足し、重複は足さないこと', async () => {
    const requestedPages: (string | null)[] = [];
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        requestedPages.push(page);
        return page === '0'
          ? HttpResponse.json({ content: [buildApiRoom('r1')], totalElements: 2, number: 0, size: 1 })
          : HttpResponse.json({ content: [buildApiRoom('r1'), buildApiRoom('r2')], totalElements: 2, number: 1, size: 1 });
      }),
    );

    await state().getAllRooms();
    expect(state().allRoomsHasMore).toBe(true);
    await state().loadNextRoomsPage();

    expect(requestedPages).toEqual(['0', '1']);
    expect(state().allRooms.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(state().allRoomsHasMore).toBe(false);
  });

  test('続きが無いときは次のページを取りに行かないこと', async () => {
    let called = false;
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () => {
        called = true;
        return HttpResponse.json({ content: [], totalElements: 0 });
      }),
    );
    useRoomsStore.setState({ allRoomsHasMore: false });

    await state().loadNextRoomsPage();

    expect(called).toBe(false);
  });

  test('読み込みに失敗したら一覧を空にしてエラーを投げること', async () => {
    server.use(http.get(mockPath(API_PATHS.ROOMS.LIST), () => new HttpResponse(null, { status: 500 })));
    useRoomsStore.setState({ allRooms: [buildRoom('r1')] });

    await expect(state().getAllRooms()).rejects.toMatchObject({ status: 500 });

    expect(state().allRooms).toEqual([]);
    expect(state().allRoomsHasMore).toBe(false);
    expect(state().isAllRoomsLoading).toBe(false);
  });

  test('保存済みの並び順を一覧に反映すること', async () => {
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), () =>
        HttpResponse.json({ content: [buildApiRoom('r1'), buildApiRoom('r2')], totalElements: 2 }),
      ),
    );
    useRoomsStore.setState({
      lastSavedRoomOrder: [
        { id: 'r2', isPinned: true, order: 0 },
        { id: 'r1', isPinned: false, order: 1 },
      ],
    });

    await state().getAllRooms();

    expect(state().allRooms.map((r) => [r.id, r.isPinned])).toEqual([
      ['r2', true],
      ['r1', false],
    ]);
  });
});

describe('createNewRoom', () => {
  test('アシスタント名でルームを作り、一覧の先頭に足して ID を返すこと', async () => {
    let body: unknown = null;
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(buildApiRoom('new', { name: 'アシスタント1' }));
      }),
    );
    useRoomsStore.setState({ allRooms: [buildRoom('r1')], allRoomsHasMore: false });

    const id = await state().createNewRoom('a1', FIXTURE_ASSISTANTS);

    expect(body).toEqual({ name: 'アシスタント1', assistantId: 'a1' });
    expect(id).toBe('new');
    expect(state().allRooms.map((r) => r.id)).toEqual(['new', 'r1']);
    expect(state().allRooms[0].defaultAssistantId).toBe('a1');
    expect(state().allRoomsHasMore).toBe(true);
    expect(state().isCreatingRoom).toBe(false);
  });

  test('backend の平らな応答（pinned なし）でも作れること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), () =>
        HttpResponse.json({ id: 'flat', name: 'x', defaultAssistantId: 'a1' }),
      ),
    );

    const id = await state().createNewRoom('a1', []);

    expect(id).toBe('flat');
    expect(state().allRooms[0]).toMatchObject({ id: 'flat', isPinned: false, category: 'chat' });
  });

  test('`{ data }` で包まれた応答でも作れること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.CREATE), () =>
        HttpResponse.json({ data: buildApiRoom('wrapped') }),
      ),
    );

    expect(await state().createNewRoom('a1', [])).toBe('wrapped');
  });
});

describe('renameRoom', () => {
  test('名前を変更して一覧に反映すること（最終メッセージなど既存の値は残す）', async () => {
    server.use(
      http.patch(mockPath(API_PATHS.ROOMS.RENAME(':roomId')), () =>
        HttpResponse.json(buildApiRoom('r1', { name: '新しい名前' })),
      ),
    );
    useRoomsStore.setState({ allRooms: [buildRoom('r1', { lastMessage: '前のメッセージ' })] });

    await state().renameRoom('r1', '新しい名前');

    expect(state().allRooms[0]).toMatchObject({ name: '新しい名前', lastMessage: '前のメッセージ' });
    expect(state().isRenamingRoom).toBe(false);
  });
});

describe('ピン留め', () => {
  test('ピン留めするとピンの並びの後ろに入り、解除すると新しい順の位置に戻ること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.PIN(':roomId')), () => new HttpResponse(null, { status: 204 })),
      http.delete(mockPath(API_PATHS.ROOMS.UNPIN(':roomId')), () => new HttpResponse(null, { status: 204 })),
    );
    useRoomsStore.setState({
      allRooms: [
        buildRoom('p1', { isPinned: true }),
        buildRoom('r1', { lastMessageTime: '2026-11-03T00:00:00Z' }),
        buildRoom('r2', { lastMessageTime: '2026-11-02T00:00:00Z' }),
      ],
    });

    await state().togglePinRoom({ id: 'r2', isPinned: false });
    expect(state().allRooms.map((r) => r.id)).toEqual(['p1', 'r2', 'r1']);
    expect(selectPinnedRooms(state()).map((r) => r.id)).toEqual(['p1', 'r2']);

    await state().togglePinRoom({ id: 'r2', isPinned: true });
    expect(state().allRooms.map((r) => r.id)).toEqual(['p1', 'r1', 'r2']);
  });

  test('一括更新の結果を一覧に反映すること', async () => {
    server.use(
      http.put(mockPath(API_PATHS.ROOMS.BULK_PIN_UPDATE), () =>
        HttpResponse.json({ data: [buildRoom('r1', { isPinned: true })] }),
      ),
    );
    useRoomsStore.setState({ allRooms: [buildRoom('p0', { isPinned: true }), buildRoom('r1')] });

    await state().bulkUpdateRoomPins([{ roomId: 'r1', isPinned: true }]);

    expect(state().allRooms.map((r) => [r.id, r.isPinned])).toEqual([
      ['p0', true],
      ['r1', true],
    ]);
  });
});

describe('削除・並び替え', () => {
  test('1 件削除すると一覧と検索結果から消えること', async () => {
    server.use(
      http.delete(mockPath(API_PATHS.ROOMS.DETAIL(':roomId')), () => new HttpResponse(null, { status: 204 })),
    );
    useRoomsStore.setState({
      allRooms: [buildRoom('r1'), buildRoom('r2')],
      searchResults: [buildRoom('r1')],
    });

    await state().deleteRoom('r1');

    expect(state().allRooms.map((r) => r.id)).toEqual(['r2']);
    expect(state().searchResults).toEqual([]);
    expect(state().isDeletingRoom).toBe(false);
  });

  test('一括削除は ids を本文に載せ、並び順の記録からも消すこと', async () => {
    let body: unknown = null;
    server.use(
      http.delete(mockPath(API_PATHS.ROOMS.DEFAULT), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    useRoomsStore.setState({
      allRooms: [buildRoom('r1'), buildRoom('r2')],
      lastSavedRoomOrder: [
        { id: 'r1', isPinned: false, order: 0 },
        { id: 'r2', isPinned: false, order: 1 },
      ],
    });

    await state().deleteRooms(['r1']);

    expect(body).toEqual({ ids: ['r1'] });
    expect(state().allRooms.map((r) => r.id)).toEqual(['r2']);
    expect(state().lastSavedRoomOrder?.map((o) => o.id)).toEqual(['r2']);
  });

  test('並び順を保存すると、応答の一覧にその順を反映すること', async () => {
    server.use(
      http.put(mockPath(API_PATHS.ROOMS.REORDER), () =>
        HttpResponse.json({ data: [buildRoom('r1'), buildRoom('r2')] }),
      ),
    );
    const order = [
      { id: 'r2', isPinned: true, order: 0 },
      { id: 'r1', isPinned: false, order: 1 },
    ];

    await state().saveRoomOrder(order);

    expect(state().lastSavedRoomOrder).toEqual(order);
    expect(state().allRooms.map((r) => [r.id, r.isPinned])).toEqual([
      ['r2', true],
      ['r1', false],
    ]);
  });
});

describe('評価・検索', () => {
  test('評価を送るとルームの評価が更新されること', async () => {
    server.use(
      http.post(mockPath(API_PATHS.ROOMS.FEEDBACK(':roomId')), () => new HttpResponse(null, { status: 204 })),
    );
    useRoomsStore.setState({ allRooms: [buildRoom('r1')], searchResults: [buildRoom('r1')] });

    await state().submitRoomFeedback('r1', { rating: 'EXCELLENT' });

    expect(state().allRooms[0].rating).toBe('EXCELLENT');
    expect(state().searchResults[0].rating).toBe('EXCELLENT');
    expect(state().isSubmittingFeedback).toBe(false);
  });

  test('キーワード検索は name を付け、空のキーワードでは付けないこと', async () => {
    const names: (string | null)[] = [];
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), ({ request }) => {
        names.push(new URL(request.url).searchParams.get('name'));
        return HttpResponse.json({ content: [buildApiRoom('r1')], totalElements: 1 });
      }),
    );

    await state().searchRooms('会議');
    await state().searchRooms('  ');

    expect(names).toEqual(['会議', null]);
    expect(state().searchResults.map((r) => r.id)).toEqual(['r1']);
    expect(state().isSearchLoading).toBe(false);
  });

  test('検索に失敗したら結果を空にしてエラーを投げること', async () => {
    server.use(http.get(mockPath(API_PATHS.ROOMS.LIST), () => new HttpResponse(null, { status: 500 })));
    useRoomsStore.setState({ searchResults: [buildRoom('r1')] });

    await expect(state().searchRooms('x')).rejects.toMatchObject({ status: 500 });
    expect(state().searchResults).toEqual([]);
  });

  test('updateRoom は undefined の項目で既存の値を消さないこと', () => {
    useRoomsStore.setState({ allRooms: [buildRoom('r1', { lastMessage: 'a' })] });

    state().updateRoom('r1', { lastMessage: undefined, name: '変更' });

    expect(state().allRooms[0]).toMatchObject({ name: '変更', lastMessage: 'a' });
  });

describe('古い検索の応答', () => {
  test('後から入力した検索の結果を、遅れて届いた前の検索の応答で上書きしないこと', async () => {
    let releaseSlow: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      releaseSlow = resolve;
    });
    server.use(
      http.get(mockPath(API_PATHS.ROOMS.LIST), async ({ request }) => {
        const name = new URL(request.url).searchParams.get('name');
        if (name === 'ab') await slow;
        return HttpResponse.json({ content: [buildApiRoom(`hit-${name}`)], totalElements: 1 });
      }),
    );

    const first = state().searchRooms('ab');
    await state().searchRooms('abc');
    releaseSlow();
    await first;

    expect(state().searchResults.map((r) => r.id)).toEqual(['hit-abc']);
    expect(state().isSearchLoading).toBe(false);
  });
});

});
