import { API_PATHS } from '../../constants/api-paths.config';
import type { MOCK_ROOMS } from '../../constants/mock-data/rooms.mock';
import { MOCK_SHARES } from '../../constants/mock-data/rooms.mock';
import type { MockRoute } from '../api-mock';

type RuntimeRoom = (typeof MOCK_ROOMS)[number];

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

function syncRoomShareState(room: RuntimeRoom, shareId: string | null, teamIds: string[]): void {
  room.shareId = shareId;
  room.teamIds = teamIds;
}

export function shareMockRoutes(runtimeRooms: RuntimeRoom[]): MockRoute[] {
  return [
    {
      method: 'POST',
      match: API_PATHS.SHARES.CREATE,
      handler: (_url, body) => {
        const b = parseBody(body);
        const roomId = (b['roomId'] as string) ?? '';
        const teamIds = (b['teamIds'] as string[]) ?? [];

        if (teamIds.length === 0) {
          return [400, { message: 'teamIds must not be empty' }];
        }

        const room = runtimeRooms.find((r) => r.id === roomId);
        if (!room) {
          return [404, { message: 'Room not found' }];
        }

        let share = MOCK_SHARES.find((s) => s.roomId === roomId);
        if (share) {
          share.teamIds = teamIds;
        } else {
          share = { id: `share-${Date.now()}`, roomId, teamIds };
          MOCK_SHARES.push(share);
        }

        syncRoomShareState(room, share.id, teamIds);
        return [200, { data: { id: share.id, roomId, teamIds } }];
      },
    },
    {
      method: 'GET',
      match: new RegExp(`^${API_PATHS.SHARES.CREATE}/[^/]+/access$`),
      handler: (url) => {
        const parts = getPathOnly(url).split('/');
        const shareId = parts.at(-2) ?? '';
        const share = MOCK_SHARES.find((s) => s.id === shareId);

        if (!share) {
          return [404, { message: 'Share not found' }];
        }

        const room = runtimeRooms.find((r) => r.id === share.roomId);
        if (!room) {
          return [404, { message: 'Room not found' }];
        }

        return [
          200,
          {
            data: {
              roomId: share.roomId,
              isReadOnly: true,
              teamIds: share.teamIds,
              roomName: room.name,
            },
          },
        ];
      },
    },
    {
      method: 'DELETE',
      match: new RegExp(`^${API_PATHS.SHARES.CREATE}/[^/]+$`),
      handler: (url) => {
        const shareId = getPathOnly(url).split('/').at(-1) ?? '';
        const idx = MOCK_SHARES.findIndex((s) => s.id === shareId);
        if (idx !== -1) {
          const share = MOCK_SHARES[idx];
          const room = runtimeRooms.find((r) => r.id === share.roomId);
          if (room) {
            syncRoomShareState(room, null, []);
          }
          MOCK_SHARES.splice(idx, 1);
        }
        return [200, { data: { id: shareId } }];
      },
    },
  ];
}
