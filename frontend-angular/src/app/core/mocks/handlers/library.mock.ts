import { API_PATHS } from '../../constants/api-paths.config';
import {
  MOCK_LIBRARY_CONTENT_LIST,
  MOCK_LIBRARY_ITEMS,
  MOCK_LIBRARY_PAGE_ITEMS,
} from '../../constants/mock-data/library-items.mock';
import { MOCK_TAG_ITEMS } from '../../constants/mock-data/tags.mock';
import { MOCK_GROUPS } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

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

const adminLibraryDetailMatch = /^\/libraries\/[^/]+$/;

export const libraryMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.LIBRARY.LIST,
    handler: (_url, _body, params) => {
      const q = (params['q'] ?? '').toLowerCase();
      const filtered = q
        ? MOCK_LIBRARY_ITEMS.filter((i) => i.name.toLowerCase().includes(q))
        : MOCK_LIBRARY_ITEMS;
      const page = parseInt(params['page'] ?? '0', 10);
      const pageSize = parseInt(params['pageSize'] ?? params['size'] ?? '20', 10);
      const start = page * pageSize;
      const content = filtered.slice(start, start + pageSize);
      return [
        200,
        {
          data: {
            content,
            totalElements: filtered.length,
            number: page,
            size: pageSize,
            totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
          },
        },
      ];
    },
  },
  {
    method: 'POST',
    match: API_PATHS.LIBRARY.CREATE,
    handler: (_url, body) => {
      const b = parseBody(body);
      const newItem = {
        id: `lib-${Date.now()}`,
        name: (b['contentName'] as string) ?? '無題',
        tags: (b['tagIds'] as string[]) ?? [],
        createdDate: new Date(),
        creator: 'ユーザー',
        contentType: 'document' as const,
      };
      MOCK_LIBRARY_ITEMS.unshift(newItem);
      return [201, { data: newItem }];
    },
  },
  {
    method: 'GET',
    match: /^\/library\/[^/]+\/list$/,
    handler: () => [200, { data: MOCK_LIBRARY_CONTENT_LIST }],
  },

  // ─── /libraries: コンテンツタブ一覧・設定変更・削除 ──────────────────
  {
    method: 'GET',
    match: API_PATHS.ADMIN.LIBRARY.LIST,
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '5', 10);
      const title = (params['title'] ?? '').toLowerCase();
      const createdBy = params['createdBy'];
      const excludeCreatedBy = params['excludeCreatedBy'];
      const tagId = params['tagIds'];
      const sortBy = params['sortBy'] ?? 'updatedAt';
      const sortDir = params['sortDir'] ?? 'desc';

      let rows = [...MOCK_LIBRARY_PAGE_ITEMS];
      if (title) rows = rows.filter((i) => i.title.toLowerCase().includes(title));
      if (createdBy) rows = rows.filter((i) => i.userId === createdBy);
      if (excludeCreatedBy) rows = rows.filter((i) => i.userId !== excludeCreatedBy);
      if (tagId) rows = rows.filter((i) => i.tags.some((t) => t.id === tagId));

      rows.sort((a, b) => {
        const aV = sortBy === 'title' ? a.title : a.updatedAt;
        const bV = sortBy === 'title' ? b.title : b.updatedAt;
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const content = rows.slice(start, start + size);
      // バックエンドは { data: Page<LibraryPageItemResponse> } の形でラップして返す
      return [200, { data: { content, totalElements: rows.length, number: page, size } }];
    },
  },
  {
    method: 'PUT',
    match: adminLibraryDetailMatch,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const target = MOCK_LIBRARY_PAGE_ITEMS.find((i) => i.id === id);
      if (!target) return [404, { message: 'not found' }];

      const b = parseBody(body) as { name?: string; tags?: string[]; groups?: string[] };
      if (b.name !== undefined) target.title = b.name;
      if (b.tags !== undefined) {
        target.tags = b.tags.map((tagId) => {
          const found = MOCK_TAG_ITEMS.find((t) => t.id === tagId);
          return { id: tagId, name: found?.name ?? tagId };
        });
      }
      if (b.groups !== undefined) {
        target.sharedGroups = b.groups.map((groupId) => {
          const found = MOCK_GROUPS.find((g) => g.id === groupId);
          return { id: groupId, name: found?.name ?? groupId };
        });
      }
      target.updatedAt = new Date().toISOString();
      return [200, { data: { id: target.id } }];
    },
  },
  {
    method: 'DELETE',
    match: adminLibraryDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const index = MOCK_LIBRARY_PAGE_ITEMS.findIndex((i) => i.id === id);
      if (index === -1) return [404, { message: 'not found' }];
      MOCK_LIBRARY_PAGE_ITEMS.splice(index, 1);
      return [204, {}];
    },
  },
];
