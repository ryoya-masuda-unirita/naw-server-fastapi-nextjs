import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧。テストごとの応答は server.use で上書きする。
// 形は backend の GroupListPageResponse・PagedUserResponse・PagedAssistantResponse・
// PagedPromptTemplateResponse・PagedGroupMemberResponse に合わせる。
// グループ一覧（GET /api/admin/groups）は admin-templates.ts の既定を使う。
const EMPTY_PAGE = { content: [], totalElements: 0, number: 0, size: 20 };

export const adminGroupHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 1000 }),
  ),
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST), () => HttpResponse.json(EMPTY_PAGE)),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.USERS(':groupId')), () => HttpResponse.json(EMPTY_PAGE)),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.ASSISTANTS(':groupId')), () =>
    HttpResponse.json(EMPTY_PAGE),
  ),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.TEMPLATES(':groupId')), () =>
    HttpResponse.json(EMPTY_PAGE),
  ),
];
