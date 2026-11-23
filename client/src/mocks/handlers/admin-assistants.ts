import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧・選択肢なし。テストごとの応答は server.use で上書きする。
// 形は backend の PagedAssistantResponse・AssistantCategoryResponse・AssistantEndpointResponse・
// AIModelResponse・GroupListPageResponse・PagedIndexResponse に合わせる。
export const adminAssistantHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 10 }),
  ),
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.LIST), () => HttpResponse.json([])),
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.ENDPOINTS_BY_TYPE(':type')), () =>
    HttpResponse.json([]),
  ),
  http.get(mockPath(API_PATHS.ADMIN.ASSISTANTS.AI_MODELS), () => HttpResponse.json([])),
  http.get(mockPath(API_PATHS.ADMIN.ALL_GROUPS.LIST), () =>
    HttpResponse.json({ data: [], total: 0, page: 0, size: 20 }),
  ),
  http.get(mockPath(API_PATHS.INDEXES.LIST), () =>
    HttpResponse.json({ content: [], totalElements: 0, number: 0, size: 1000 }),
  ),
];
