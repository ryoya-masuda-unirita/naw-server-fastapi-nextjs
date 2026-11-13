import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 共有 API の既定の応答。形は backend（schemas/share.py）に合わせて `{ data }` で包む。
// テストごとの応答は server.use で上書きする。
export const sharesHandlers = [
  http.post(mockPath(API_PATHS.SHARES.CREATE), async ({ request }) => {
    const body = (await request.json()) as { roomId: string; teamIds: string[] };
    return HttpResponse.json({ data: { id: 'share-1', ...body } });
  }),
  http.delete(mockPath(API_PATHS.SHARES.DELETE(':shareId')), ({ params }) =>
    HttpResponse.json({ data: { id: params.shareId } }),
  ),
  http.get(mockPath(API_PATHS.SHARES.ACCESS(':shareId')), () =>
    HttpResponse.json({
      data: { roomId: 'room-1', roomName: null, isReadOnly: true, teamIds: [] },
    }),
  ),
];
