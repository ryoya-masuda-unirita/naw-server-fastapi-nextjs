import { TagItem } from '@app-types/admin/library.types';
import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_TAG_ITEMS } from '../../constants/mock-data/tags.mock';
import type { MockRoute } from '../api-mock';

interface TagPayload {
  name?: string;
  description?: string;
}

function parseBody(body: unknown): TagPayload {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as TagPayload;
    } catch {
      return {};
    }
  }
  return body as TagPayload;
}

function nextTagId(): string {
  const numericIds = MOCK_TAG_ITEMS.map((t) => parseInt(t.id, 10)).filter((n) =>
    Number.isFinite(n),
  );
  const max = numericIds.length ? Math.max(...numericIds) : 0;
  return String(max + 1);
}

const adminLibraryTagDetailMatch = new RegExp(
  `^${API_PATHS.ADMIN_LIBRARY_TAGS.LIST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
);

function toPageResponse(items: TagItem[], page: number, size: number) {
  const totalElements = items.length;
  const start = page * size;
  const content = items.slice(start, start + size);
  return {
    content,
    totalElements,
    number: page,
    size,
    totalPages: Math.max(1, Math.ceil(totalElements / size)),
  };
}

export const adminTagsMockRoutes: MockRoute[] = [
  // ─── /tags: chat側の TagsService が使うエンドポイント（GET のみ）────
  {
    method: 'GET',
    match: API_PATHS.TAGS.LIST,
    handler: () => [200, { data: [...MOCK_TAG_ITEMS], total: MOCK_TAG_ITEMS.length }],
  },

  // ─── /admin/library-tags: 管理者タグ管理 ────────────────────────────
  {
    method: 'GET',
    match: API_PATHS.ADMIN_LIBRARY_TAGS.LIST,
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '25', 10);
      const sort = params['sort'] ?? 'updatedAt,desc';

      const [field, order] = sort.split(',');
      const desc = (order ?? 'desc') !== 'asc';

      const sorted = [...MOCK_TAG_ITEMS];
      if (field === 'name') {
        sorted.sort((a, b) => {
          const cmp = a.name.localeCompare(b.name, 'ja');
          return desc ? -cmp : cmp;
        });
      } else {
        sorted.sort((a, b) => {
          const cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          return desc ? -cmp : cmp;
        });
      }

      return [200, toPageResponse(sorted, page, size)];
    },
  },
  {
    method: 'POST',
    match: API_PATHS.ADMIN_LIBRARY_TAGS.CREATE,
    handler: (_url, body) => {
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      if (!name) return [400, { message: 'name is required' }];
      const description = b.description?.trim() || undefined;
      const created: TagItem = {
        id: nextTagId(),
        name,
        description,
        updatedAt: new Date().toISOString(),
      };
      MOCK_TAG_ITEMS.unshift(created);
      return [200, created];
    },
  },
  {
    method: 'PATCH',
    match: adminLibraryTagDetailMatch,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_TAG_ITEMS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'tag not found' }];
      const b = parseBody(body);
      const existing = MOCK_TAG_ITEMS[idx];
      const updated: TagItem = {
        ...existing,
        name: b.name !== undefined ? b.name.trim() : existing.name,
        description:
          b.description !== undefined ? b.description.trim() || undefined : existing.description,
        updatedAt: new Date().toISOString(),
      };
      MOCK_TAG_ITEMS[idx] = updated;
      return [200, updated];
    },
  },
  {
    method: 'DELETE',
    match: API_PATHS.ADMIN_LIBRARY_TAGS.DELETE,
    handler: (_url, body) => {
      const ids = (body as { ids?: string[] })?.ids ?? [];
      if (!ids.length) return [400, { message: 'ids is required' }];
      const idSet = new Set(ids);
      for (let i = MOCK_TAG_ITEMS.length - 1; i >= 0; i--) {
        if (idSet.has(MOCK_TAG_ITEMS[i].id)) {
          MOCK_TAG_ITEMS.splice(i, 1);
        }
      }
      return [204, null];
    },
  },
];
