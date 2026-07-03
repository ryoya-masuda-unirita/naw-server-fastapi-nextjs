import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/angular-query-experimental';
import { RoomsService } from './rooms.service';
import { ApiClientService } from '@core/services/api-client';
import { AssistantsService } from './assistants.service';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { ChatRoom, RoomListApiItem, RenameRoomResponse } from '@app-types/chat/chat-room.type';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

function buildApiRoom(overrides: Partial<RoomListApiItem> = {}): RoomListApiItem {
  return {
    id: 'room-1',
    name: 'Test Room',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    defaultAssistantId: 'assistant-1',
    tenantId: 'tenant-1',
    userId: 'user-1',
    rating: null,
    shareUrl: null,
    ...overrides,
  };
}

function buildChatRoom(overrides: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: 'room-1',
    name: 'Test Room',
    isPinned: false,
    category: 'chat',
    ...overrides,
  };
}

describe('RoomsService', () => {
  let service: RoomsService;
  let api: ReturnType<typeof buildApiClientMock>;
  let mockQueryClient: {
    invalidateQueries: ReturnType<typeof vi.fn>;
    refetchQueries: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    api = buildApiClientMock();
    mockQueryClient = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
      refetchQueries: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      providers: [
        RoomsService,
        { provide: ApiClientService, useValue: api },
        { provide: QueryClient, useValue: mockQueryClient },
        {
          provide: AssistantsService,
          useValue: { assistantsQuery: { data: vi.fn(() => []) } },
        },
      ],
    });
    service = TestBed.inject(RoomsService);
  });

  describe('サイドバーのチャット一覧を読み込む', () => {
    it('サイドバーに表示するチャット一覧をサーバーから取得できる', async () => {
      api.get.mockResolvedValue({
        content: [buildApiRoom({ id: 'room-1', name: 'Room A', pinned: true })],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      await service.getAllRooms();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ROOMS.LIST, {
        params: { page: 0, size: 20 },
      });
      expect(service.allRooms()).toEqual([
        expect.objectContaining({
          id: 'room-1',
          name: 'Room A',
          isPinned: true,
          category: 'chat',
          lastMessageTime: '2026-01-02T00:00:00.000Z',
        }),
      ]);
    });

    it('チャット一覧の取得に失敗したとき、一覧を空にしてエラーを伝える', async () => {
      service.allRooms.set([buildChatRoom()]);
      api.get.mockRejectedValue(new Error('network'));

      await expect(service.getAllRooms()).rejects.toThrow('network');
      expect(service.allRooms()).toEqual([]);
    });
  });

  describe('チャットを検索する', () => {
    it('検索キーワードに一致するチャットが検索結果に表示される', async () => {
      api.get.mockResolvedValue({
        content: [buildApiRoom({ id: 'room-2', name: 'Search Hit' })],
        total: 1,
        page: 1,
        pageSize: 20,
      });

      await service.searchRooms('hit');

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ROOMS.LIST, {
        params: { name: 'hit' },
      });
      expect(service.searchResults()).toEqual([
        expect.objectContaining({ id: 'room-2', name: 'Search Hit', isPinned: false }),
      ]);
    });
  });

  describe('チャット名を変更する', () => {
    it('チャット名を変更しても、直前のメッセージ内容はサイドバーに残る', async () => {
      const existing = buildChatRoom({
        id: 'room-1',
        name: 'Old Name',
        lastMessage: 'keep me',
        lastMessageTime: '2026-01-01T10:00:00.000Z',
      });
      service.allRooms.set([existing]);

      const response: RenameRoomResponse = {
        ...buildApiRoom({ id: 'room-1', name: 'New Name' }),
      };
      api.patch.mockResolvedValue(response);

      await service.renameRoom('room-1', 'New Name');

      expect(api.patch).toHaveBeenCalledWith(API_PATHS.ROOMS.RENAME('room-1'), {
        name: 'New Name',
      });
      expect(service.allRooms()[0]).toEqual(
        expect.objectContaining({
          id: 'room-1',
          name: 'New Name',
          lastMessage: 'keep me',
          lastMessageTime: '2026-01-01T10:00:00.000Z',
        }),
      );
    });
  });

  describe('チャットのピン留め', () => {
    it('チャットをピン留めすると、ピン留め済みのチャットが一覧の先頭に並ぶ', async () => {
      service.allRooms.set([
        buildChatRoom({ id: 'a', name: 'A', isPinned: false }),
        buildChatRoom({ id: 'b', name: 'B', isPinned: true }),
        buildChatRoom({ id: 'c', name: 'C', isPinned: false }),
      ]);

      api.post.mockResolvedValue(null);

      await service.togglePinRoom({ id: 'c', isPinned: false });

      expect(api.post).toHaveBeenCalledWith(API_PATHS.ROOMS.PIN('c'));
      expect(service.allRooms().map((room) => room.id)).toEqual(['b', 'c', 'a']);
      expect(service.allRooms().find((room) => room.id === 'c')?.isPinned).toBe(true);
    });

    it('ピン留めを解除すると、未ピン一覧の本来の並び (新しい順) に戻る', async () => {
      service.allRooms.set([
        buildChatRoom({
          id: 'a',
          name: 'A',
          isPinned: true,
          lastMessageTime: '2026-01-02T00:00:00.000Z',
        }),
        buildChatRoom({
          id: 'b',
          name: 'B',
          isPinned: false,
          lastMessageTime: '2026-01-01T00:00:00.000Z',
        }),
      ]);
      api.delete.mockResolvedValue(undefined);

      await service.togglePinRoom({ id: 'a', isPinned: true });

      expect(api.delete).toHaveBeenCalledWith(API_PATHS.ROOMS.UNPIN('a'));
      expect(service.allRooms().find((room) => room.id === 'a')?.isPinned).toBe(false);
      expect(service.allRooms().every((room) => !room.isPinned)).toBe(true);
      expect(service.allRooms().map((room) => room.id)).toEqual(['a', 'b']);
    });
  });

  describe('ページング', () => {
    it('次ページを読み込むと既存のルームに追記される', async () => {
      service.allRooms.set([buildChatRoom({ id: 'room-1', name: 'Page 1' })]);
      service.allRoomsHasMore.set(true);

      api.get.mockResolvedValue({
        content: [buildApiRoom({ id: 'room-2', name: 'Page 2' })],
        total: 2,
        page: 1,
        pageSize: 20,
      });

      await service.loadNextRoomsPage();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ROOMS.LIST, {
        params: { page: 1, size: 20 },
      });
      expect(service.allRooms().map((room) => room.id)).toEqual(['room-1', 'room-2']);
      expect(service.allRoomsHasMore()).toBe(false);
    });

    it('これ以上ページがないときは追加リクエストしない', async () => {
      service.allRoomsHasMore.set(false);

      await service.loadNextRoomsPage();

      expect(api.get).not.toHaveBeenCalled();
    });
  });

  describe('新しいチャットルームを作成する', () => {
    it('{ data: ChatRoom } 形式のレスポンスからルーム ID を返す', async () => {
      api.post.mockResolvedValue({
        data: buildChatRoom({ id: 'room-new', name: 'New Chat', defaultAssistantId: 'asst-1' }),
      });

      const roomId = await service.createNewRoom('asst-1');

      expect(api.post).toHaveBeenCalledWith(API_PATHS.ROOMS.CREATE, {
        name: '',
        assistantId: 'asst-1',
      });
      expect(roomId).toBe('room-new');
      expect(service.allRooms()[0]).toEqual(
        expect.objectContaining({
          id: 'room-new',
          name: 'New Chat',
          defaultAssistantId: 'asst-1',
          category: 'chat',
        }),
      );
    });

    it('RoomListApiItem 形式のレスポンスを ChatRoom に正規化して返す', async () => {
      api.post.mockResolvedValue(
        buildApiRoom({
          id: 'room-api',
          name: 'API Room',
          pinned: false,
          defaultAssistantId: 'asst-2',
        }),
      );

      const roomId = await service.createNewRoom('asst-2');

      expect(roomId).toBe('room-api');
      expect(service.allRooms()[0]).toEqual(
        expect.objectContaining({
          id: 'room-api',
          name: 'API Room',
          isPinned: false,
          defaultAssistantId: 'asst-2',
          category: 'chat',
        }),
      );
    });
  });

  describe('チャット情報の部分更新', () => {
    it('更新対象以外のチャット情報（名前・最終メッセージ）はそのまま保持される', () => {
      service.allRooms.set([
        buildChatRoom({
          id: 'room-1',
          name: 'Keep Name',
          lastMessage: 'Keep Message',
        }),
      ]);

      service.updateRoom('room-1', { name: undefined, isPinned: true });

      expect(service.allRooms()[0]).toEqual(
        expect.objectContaining({
          name: 'Keep Name',
          lastMessage: 'Keep Message',
          isPinned: true,
        }),
      );
    });
  });

  describe('チャット満足度を送信する', () => {
    it('満足度評価送信後に関連するフィードバック一覧を再取得する', async () => {
      api.post.mockResolvedValue({});
      service.allRooms.set([buildChatRoom({ id: 'room-1' })]);

      await service.submitRoomFeedback('room-1', { rating: 'GOOD' });

      expect(api.post).toHaveBeenCalledWith(API_PATHS.ROOMS.FEEDBACK('room-1'), {
        rating: 'GOOD',
      });
      expect(service.allRooms()[0]).toEqual(expect.objectContaining({ rating: 'GOOD' }));
      expect(mockQueryClient.refetchQueries).toHaveBeenCalledWith({
        predicate: expect.any(Function),
      });
    });

    it('満足度一覧、件数一覧、精度評価一覧だけを更新対象にする', async () => {
      api.post.mockResolvedValue({});

      await service.submitRoomFeedback('room-1', { rating: 'GOOD' });

      const [{ predicate }] = mockQueryClient.refetchQueries.mock.calls[0];

      expect(predicate({ queryKey: ['feedback', 'accuracy'] })).toBe(true);
      expect(predicate({ queryKey: ['feedback', 'satisfaction'] })).toBe(true);
      expect(predicate({ queryKey: ['feedback', 'users'] })).toBe(true);
      expect(predicate({ queryKey: ['feedback', 'other'] })).toBe(false);
      expect(predicate({ queryKey: ['admin', 'users'] })).toBe(false);
    });
  });
});
