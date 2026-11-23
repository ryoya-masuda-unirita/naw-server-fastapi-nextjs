import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧とグループなし。テストごとの応答は server.use で上書きする。
// 形は backend の PagedPromptTemplateResponse・GroupListPageResponse に合わせる。
export const adminTemplateHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 10 }),
  ),
  http.get(mockPath(API_PATHS.ADMIN.GROUPS.LIST), () =>
    HttpResponse.json({ data: [], total: 0, page: 0, size: 1000 }),
  ),
];
