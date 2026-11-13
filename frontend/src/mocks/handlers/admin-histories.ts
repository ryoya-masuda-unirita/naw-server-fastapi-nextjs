import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧。テストごとの応答は server.use で上書きする。
// 形は backend の PagedAdminRoomHistoryResponse に合わせる。
export const adminHistoryHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.HISTORIES.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 20 }),
  ),
];
