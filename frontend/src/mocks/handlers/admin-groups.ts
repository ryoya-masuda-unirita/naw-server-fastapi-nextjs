import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧。テストごとの応答は server.use で上書きする。
// 形は backend の GroupListPageResponse・PagedUserResponse・PagedAssistantResponse・
// PagedPromptTemplateResponse・PagedGroupMemberResponse に合わせる。
// グループ一覧（GET /api/admin/groups）は admin-templates.ts、ユーザー一覧（GET /api/admin/users）は
// admin-users.ts の既定を使う（同じ URL の既定をここで重ねると、先に読まれて他の画面のテストを壊す）。
const EMPTY_PAGE = { content: [], totalElements: 0, number: 0, size: 20 };

export const adminGroupHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST), () => HttpResponse.json(EMPTY_PAGE)),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.USERS(':groupId')), () => HttpResponse.json(EMPTY_PAGE)),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.ASSISTANTS(':groupId')), () =>
    HttpResponse.json(EMPTY_PAGE),
  ),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.TEMPLATES(':groupId')), () =>
    HttpResponse.json(EMPTY_PAGE),
  ),
];
