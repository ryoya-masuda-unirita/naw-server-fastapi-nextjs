import { API_PATHS } from '../../constants/api-paths.config';
import { upsertRoomFeedback } from '../../constants/mock-data/feedback.mock';
import type { MOCK_ROOMS } from '../../constants/mock-data/rooms.mock';
import type { RoomFeedbackRating, RoomListApiItem } from '@app-types/chat/chat-room.type';
import type { MockRoute } from '../api-mock';
import { buildShareUrl } from '../../utils/share-url.util';

type RuntimeRoom = (typeof MOCK_ROOMS)[number];

const toRoomListApiItem = (room: RuntimeRoom): RoomListApiItem => ({
  id: room.id,
  name: room.name,
  pinned: room.isPinned,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  defaultAssistantId: room.defaultAssistantId ?? '',
  tenantId: 'test-tenant',
  userId: 'mock-user-id',
  rating: room.rating ?? null,
  shareUrl: room.shareId ? buildShareUrl(room.shareId, 'http://localhost:4200') : null,
  teamIds: room.teamIds ?? [],
});

const ROOM_FEEDBACK_RATINGS: readonly RoomFeedbackRating[] = [
  'EXCELLENT',
  'VERY_GOOD',
  'GOOD',
  'AVERAGE',
  'POOR',
];

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

function getPathOnly(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function roomMockRoutes(runtimeRooms: RuntimeRoom[]): MockRoute[] {
  return [
    {
      method: 'GET',
      match: API_PATHS.ROOMS.LIST,
      handler: (_url, _body, params) => {
        const page = parseInt(params['page'] ?? '0', 10);
        const size = parseInt(params['size'] ?? params['pageSize'] ?? '20', 10);
        const query = (params['q'] ?? params['name'] ?? '').toLowerCase();
        const isPinned = params['isPinned'];
        const shouldPage =
          params['size'] !== undefined ||
          params['pageSize'] !== undefined ||
          params['page'] !== undefined;

        let rows = [...runtimeRooms];
        if (isPinned === 'true') rows = rows.filter((r) => r.isPinned);
        if (isPinned === 'false') rows = rows.filter((r) => !r.isPinned);
        if (query) {
          rows = rows.filter(
            (r) =>
              r.name.toLowerCase().includes(query) ||
              (r.lastMessage ?? '').toLowerCase().includes(query),
          );
        }

        rows.sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

        const total = rows.length;
        const paged = shouldPage ? rows.slice(page * size, page * size + size) : rows;
        const content = paged.map(toRoomListApiItem);

        return [
          200,
          {
            content,
            total,
            page: shouldPage ? page : 0,
            pageSize: shouldPage ? size : total,
          },
        ];
      },
    },
    {
      method: 'POST',
      match: API_PATHS.ROOMS.CREATE,
      handler: (_url, body) => {
        const b = parseBody(body);
        const newRoom = {
          id: `room-${Date.now()}`,
          name: (b['name'] as string | undefined) ?? '新しいチャット',
          isPinned: false,
          category: 'chat' as const,
          lastMessageTime: new Date(),
        };
        runtimeRooms.unshift(newRoom);
        return [201, { data: newRoom }];
      },
    },
    {
      method: 'POST',
      match: new RegExp(`^${API_PATHS.ROOMS.LIST}/[^/]+/pin$`),
      handler: (url) => {
        const parts = getPathOnly(url).split('/');
        const roomId = parts[parts.length - 2];
        const room = runtimeRooms.find((r) => r.id === roomId);
        if (!room) return [404, { message: 'Room not found' }];
        room.isPinned = true;
        return [200, { data: room }];
      },
    },
    {
      method: 'DELETE',
      match: new RegExp(`^${API_PATHS.ROOMS.LIST}/[^/]+/pin$`),
      handler: (url) => {
        const parts = getPathOnly(url).split('/');
        const roomId = parts[parts.length - 2];
        const room = runtimeRooms.find((r) => r.id === roomId);
        if (!room) return [404, { message: 'Room not found' }];
        room.isPinned = false;
        return [200, { data: room }];
      },
    },
    {
      method: 'PUT',
      match: API_PATHS.ROOMS.BULK_PIN_UPDATE,
      handler: (_url, body) => {
        const b = parseBody(body);
        const updates = (b['rooms'] as { roomId: string; isPinned: boolean }[] | undefined) ?? [];
        const updated: RuntimeRoom[] = [];
        updates.forEach(({ roomId, isPinned }) => {
          const room = runtimeRooms.find((r) => r.id === roomId);
          if (!room) return;
          room.isPinned = isPinned;
          updated.push(room);
        });
        return [200, { data: updated }];
      },
    },
    {
      method: 'PUT',
      match: API_PATHS.ROOMS.REORDER,
      handler: (_url, body) => {
        const b = parseBody(body);
        const items: { id: string; isPinned: boolean; order: number }[] =
          (b['rooms'] as { id: string; isPinned: boolean; order: number }[]) ?? [];
        items.forEach(({ id, isPinned }) => {
          const room = runtimeRooms.find((r) => r.id === id);
          if (room) room.isPinned = isPinned;
        });
        const ordered = items
          .sort((a, b) => a.order - b.order)
          .map(({ id }) => runtimeRooms.find((r) => r.id === id)!)
          .filter(Boolean);
        const rest = runtimeRooms.filter((r) => !items.some((i) => i.id === r.id));
        runtimeRooms.splice(0, runtimeRooms.length, ...ordered, ...rest);
        return [200, { data: runtimeRooms }];
      },
    },
    {
      method: 'PATCH',
      match: new RegExp(`^${API_PATHS.ROOMS.LIST}/[^/]+$`),
      handler: (url, body) => {
        const roomId = getPathOnly(url).split('/').at(-1) ?? '';
        const b = parseBody(body);
        const room = runtimeRooms.find((r) => r.id === roomId);
        if (!room) return [404, { message: 'Room not found' }];
        if (b['title']) room.name = b['title'] as string;
        if (b['name']) room.name = b['name'] as string;
        return [200, toRoomListApiItem(room)];
      },
    },
    {
      method: 'DELETE',
      match: new RegExp(`^${API_PATHS.ROOMS.LIST}/[^/]+$`),
      handler: (url) => {
        const roomId = getPathOnly(url).split('/').at(-1) ?? '';
        const index = runtimeRooms.findIndex((r) => r.id === roomId);
        if (index === -1) return [404, { message: 'Room not found' }];
        runtimeRooms.splice(index, 1);
        return [200, { data: { id: roomId } }];
      },
    },
    {
      method: 'DELETE',
      match: API_PATHS.ROOMS.LIST,
      handler: (_url, body) => {
        const b = parseBody(body);
        const ids: string[] = (b['ids'] as string[]) ?? [];
        ids.forEach((id) => {
          const index = runtimeRooms.findIndex((r) => r.id === id);
          if (index !== -1) runtimeRooms.splice(index, 1);
        });
        return [200, { data: { ids } }];
      },
    },
    {
      method: 'POST',
      match: new RegExp(`^${API_PATHS.ROOMS.LIST}/[^/]+/feedback$`),
      handler: (url, body) => {
        const parts = getPathOnly(url).split('/');
        const roomId = parts[parts.length - 2];
        const room = runtimeRooms.find((r) => r.id === roomId);
        if (!room) return [404, { message: 'Room not found' }];
        const b = parseBody(body);
        const rating = b['rating'];
        if (!ROOM_FEEDBACK_RATINGS.includes(rating as RoomFeedbackRating)) {
          return [400, { message: 'リクエスト不正' }];
        }
        upsertRoomFeedback(room, rating as RoomFeedbackRating);
        return [200, { data: { roomId, rating } }];
      },
    },
  ];
}
