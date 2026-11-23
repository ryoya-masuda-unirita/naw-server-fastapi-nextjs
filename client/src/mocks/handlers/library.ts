import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧。テストごとの応答は server.use で上書きする。
// 形は backend の LibraryPageResponse（`{ data: Page }` で包む）・LibraryTagListResponse・LibraryTagPageResponse に合わせる。
export const libraryHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.LIBRARY.LIST), () =>
    HttpResponse.json({ data: { content: [], totalElements: 0, number: 0, size: 5 } }),
  ),
  http.get(mockPath(API_PATHS.LIBRARIES.TAGS), () => HttpResponse.json({ tags: [] })),
  http.get(mockPath(API_PATHS.USERS.PROFILE), () =>
    HttpResponse.json({ id: 'profile-uuid', loginId: 'user1', name: 'ユーザー' }),
  ),
  http.get(mockPath(API_PATHS.GROUPS.LIST), () => HttpResponse.json([])),
  http.get(mockPath(API_PATHS.ADMIN_LIBRARY_TAGS.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 25 }),
  ),
];
