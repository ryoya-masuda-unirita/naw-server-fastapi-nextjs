import { describe, test, expect } from 'vitest';
import { mapRoomListApiItemToChatRoom } from './room-list-mapper.util';
import { ChatRoom, RoomListApiItem } from '@app-types/chat/chat-room.type';

const FIXTURE_API_ITEM: RoomListApiItem = {
  id: 'room-1',
  name: 'テストルーム',
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  defaultAssistantId: 'asst-001',
  tenantId: 'tenant-1',
  userId: 'user-1',
  rating: null,
  shareUrl: null,
};

describe('mapRoomListApiItemToChatRoom', () => {
  test('APIレスポンスに defaultAssistantId がある場合、その値が設定されること', () => {
    const result = mapRoomListApiItemToChatRoom(FIXTURE_API_ITEM);
    expect(result.defaultAssistantId).toBe('asst-001');
  });

  test('APIレスポンスに defaultAssistantId が無く、既存キャッシュにある場合、既存の値が保持されること', () => {
    const apiItem: RoomListApiItem = { ...FIXTURE_API_ITEM, defaultAssistantId: undefined };
    const existing: ChatRoom = {
      id: 'room-1',
      name: 'テストルーム',
      isPinned: false,
      category: 'chat',
      defaultAssistantId: 'asst-002',
    };
    const result = mapRoomListApiItemToChatRoom(apiItem, existing);
    expect(result.defaultAssistantId).toBe('asst-002');
  });

  test('APIレスポンス・既存キャッシュ共に無い場合、defaultAssistantId が undefined になること', () => {
    const apiItem: RoomListApiItem = { ...FIXTURE_API_ITEM, defaultAssistantId: undefined };
    const result = mapRoomListApiItemToChatRoom(apiItem);
    expect(result.defaultAssistantId).toBeUndefined();
  });

  test('shareUrl から shareId を抽出できること', () => {
    const apiItem: RoomListApiItem = {
      ...FIXTURE_API_ITEM,
      shareUrl: 'https://example.com/chat/share/share-abc',
    };
    const result = mapRoomListApiItemToChatRoom(apiItem);
    expect(result.shareId).toBe('share-abc');
  });

  test('既存キャッシュの shareId が API の shareUrl より優先されること', () => {
    const apiItem: RoomListApiItem = {
      ...FIXTURE_API_ITEM,
      shareUrl: 'https://example.com/chat/share/share-new',
    };
    const existing: ChatRoom = {
      id: 'room-1',
      name: 'テストルーム',
      isPinned: false,
      category: 'chat',
      shareId: 'share-existing',
    };
    const result = mapRoomListApiItemToChatRoom(apiItem, existing);
    expect(result.shareId).toBe('share-existing');
  });

  test('API の teamIds がマッピングされること', () => {
    const apiItem: RoomListApiItem = {
      ...FIXTURE_API_ITEM,
      teamIds: ['group-1', 'group-2'],
    };
    const result = mapRoomListApiItemToChatRoom(apiItem);
    expect(result.teamIds).toEqual(['group-1', 'group-2']);
  });
});
