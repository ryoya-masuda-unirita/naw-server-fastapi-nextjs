import {
  MOCK_ASSISTANTS_AI_MODELS,
  MOCK_ASSISTANTS_API_OPTIONS,
  MOCK_ASSISTANTS_ENDPOINTS_BY_TYPE,
  MOCK_ASSISTANTS_MODEL_OPTIONS,
  MOCK_ASSISTANTS_SERVER_OPTIONS,
  MOCK_ASSISTANTS_TEAM_OPTIONS,
  MOCK_ASSISTANTS_TERM_OPTIONS,
  MOCK_ADMIN_ASSISTANTS,
  MOCK_ADMIN_CATEGORIES,
} from '../admin-mock-data';
import { MockRoute } from '../api-mock';

// ─── Helpers ─────────────────────────────────────────────────

function parseBody(body: unknown): any {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function nextAssistantId(): string {
  const max = MOCK_ADMIN_ASSISTANTS.reduce((m, t) => {
    const n = parseInt(t.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

function nextCategoryId(): string {
  const max = MOCK_ADMIN_CATEGORIES.reduce((m, t) => {
    const n = parseInt(t.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

export const adminAssistantsMockRoutes: MockRoute[] = [
  // ─── Assistants ─────────────────────────────────────────────
  {
    method: 'GET',
    match: '/admin/assistants',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const filterServer = params['type'];
      const filterCategory = params['categoryId'];
      const filterTeam = params['groupId'];
      const excludeGroupId = params['excludeGroupId'];
      const search = (params['search'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'name,asc').split(',');

      let rows = [...MOCK_ADMIN_ASSISTANTS];

      if (filterServer) rows = rows.filter((t) => t.type === filterServer);
      if (filterCategory) {
        rows = rows.filter((t) =>
          filterCategory === 'NONE'
            ? !t.category && (!t.categories || t.categories.length === 0)
            : (t.categories ?? (t.category ? [t.category] : [])).some(
                (category) => category.id === filterCategory,
              ),
        );
      }
      if (filterTeam === 'NONE') {
        rows = rows.filter((t) => !t.groups || t.groups.length === 0);
      } else if (filterTeam) {
        rows = rows.filter((t) => t.groups.includes(filterTeam));
      }
      if (excludeGroupId) {
        rows = rows.filter((t) => !t.groups?.includes(excludeGroupId));
      }
      if (search) {
        rows = rows.filter((t) => t.name.toLowerCase().includes(search));
      }

      rows.sort((a, b) => {
        let aV: any = a.name;
        let bV: any = b.name;
        if (sortField === 'type') {
          aV = a.type;
          bV = b.type;
        } else if (sortField === 'category') {
          aV = a.category?.id;
          bV = b.category?.id;
        } else if (sortField === 'includeHistory') {
          aV = a.includeHistory;
          bV = b.includeHistory;
        }
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const content = rows.slice(page * size, (page + 1) * size);
      return [200, { content, totalElements: rows.length, number: page, size }];
    },
  },
  {
    method: 'POST',
    match: '/admin/assistants',
    handler: (_url, body) => {
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      if (!name) return [400, { message: 'name is required' }];

      const now = new Date();
      const created = {
        id: nextAssistantId(),
        ...b,
        category:
          b.categoryIds?.length > 0
            ? MOCK_ADMIN_CATEGORIES.map((category) => ({
                id: category.id,
                name: category.name,
                description: category.desc,
              })).find((category) => category.id === b.categoryIds[0])
            : null,
        categories:
          b.categoryIds?.length > 0
            ? MOCK_ADMIN_CATEGORIES.filter((category) => b.categoryIds.includes(category.id)).map(
                (category) => ({
                  id: category.id,
                  name: category.name,
                  description: category.desc,
                }),
              )
            : [],
        createdAt: now,
        updatedAt: now,
      };

      MOCK_ADMIN_ASSISTANTS.unshift(created);

      return [200, created];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/assistants\/[^/]+$/,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_ADMIN_ASSISTANTS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'assistant not found' }];

      const b = parseBody(body);
      const existing = MOCK_ADMIN_ASSISTANTS[idx];
      const updatedAt = new Date();

      const categories =
        b.categoryIds !== undefined
          ? MOCK_ADMIN_CATEGORIES.filter((category) => b.categoryIds.includes(category.id)).map(
              (category) => ({
                id: category.id,
                name: category.name,
                description: category.desc,
              }),
            )
          : existing.categories;
      const next = {
        ...existing,
        ...b,
        category: categories?.[0] ?? null,
        categories,
        updatedAt,
      };

      MOCK_ADMIN_ASSISTANTS[idx] = next;

      return [200, next];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/assistants\/[^/]+$/,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_ADMIN_ASSISTANTS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'assistant not found' }];
      MOCK_ADMIN_ASSISTANTS.splice(idx, 1);
      return [200, { id }];
    },
  },

  // ─── Categories ─────────────────────────────────────────────
  {
    method: 'GET',
    match: '/admin/assistant-categories',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const q = (params['q'] ?? params['search'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      let rows = [...MOCK_ADMIN_CATEGORIES];

      if (q) {
        rows = rows.filter(
          (c) => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q),
        );
      }

      rows.sort((a, b) => {
        let aV: any = a.updatedAt;
        let bV: any = b.updatedAt;
        if (sortField === 'name') {
          aV = a.name;
          bV = b.name;
        }

        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const data = rows.slice(start, start + size).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.desc,
        tenantId: 'tenant-dev-001',
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
        updatedUserId: 'admin-001',
      }));

      return [200, { data, total: rows.length, page, size }];
    },
  },
  {
    method: 'GET',
    match: '/admin/assistant-categories/options',
    handler: () => {
      return [200, MOCK_ADMIN_CATEGORIES.map((c) => ({ value: c.id, label: c.name }))];
    },
  },
  {
    method: 'POST',
    match: '/admin/assistant-categories',
    handler: (_url, body) => {
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      if (!name) return [400, { message: 'name is required' }];

      const now = new Date();
      const created = {
        id: nextCategoryId(),
        name: name,
        cateName: name, // CateName in mock data seems to be the same as name
        desc: b.description ?? '',
        createdAt: now,
        updatedAt: now,
      };

      MOCK_ADMIN_CATEGORIES.unshift(created);

      return [
        201,
        {
          id: created.id,
          name: created.name,
          description: created.desc,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        },
      ];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/assistant-categories\/[^/]+$/,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_ADMIN_CATEGORIES.findIndex((c) => c.id === id);
      if (idx === -1) return [404, { message: 'category not found' }];

      const b = parseBody(body);
      const existing = MOCK_ADMIN_CATEGORIES[idx];
      const updatedAt = new Date();

      const next = {
        ...existing,
        name: b.name !== undefined ? b.name.trim() : existing.name,
        desc: b.description !== undefined ? b.description : existing.desc,
        updatedAt,
      };

      MOCK_ADMIN_CATEGORIES[idx] = next;

      return [
        200,
        {
          id: next.id,
          name: next.name,
          description: next.desc,
          updatedAt: next.updatedAt.toISOString(),
        },
      ];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/assistant-categories\/[^/]+$/,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_ADMIN_CATEGORIES.findIndex((c) => c.id === id);
      if (idx === -1) return [404, { message: 'category not found' }];
      MOCK_ADMIN_CATEGORIES.splice(idx, 1);
      return [200, { id }];
    },
  },

  // ─── Options ────────────────────────────────────────────────
  {
    method: 'GET',
    match: '/admin/assistants/server-options',
    handler: () => [200, MOCK_ASSISTANTS_SERVER_OPTIONS],
  },
  {
    method: 'GET',
    match: '/admin/assistants/api-options',
    handler: () => [200, MOCK_ASSISTANTS_API_OPTIONS],
  },
  {
    method: 'GET',
    match: '/admin/assistants/model-options',
    handler: () => [200, MOCK_ASSISTANTS_MODEL_OPTIONS],
  },
  {
    method: 'GET',
    match: '/admin/assistants/group-options',
    handler: () => [200, MOCK_ASSISTANTS_TEAM_OPTIONS],
  },
  {
    method: 'GET',
    match: '/admin/assistants/dictionary-options',
    handler: () => [200, MOCK_ASSISTANTS_TERM_OPTIONS],
  },

  {
    method: 'GET',
    match: '/admin/assistants/AIModels',
    handler: () => [200, MOCK_ASSISTANTS_AI_MODELS],
  },
  {
    method: 'GET',
    match: /^\/admin\/assistants\/endpoints\/[^/]+$/,
    handler: (url) => {
      const type = url.split('/').pop() ?? '';
      return [200, MOCK_ASSISTANTS_ENDPOINTS_BY_TYPE[type] ?? []];
    },
  },
];
