import { MockRoute } from '../api-mock';
import { MOCK_TEMPLATES } from '../admin-mock-data';

interface CreatePromptTemplatePayload {
  name?: string;
  description?: string;
  systemPrompt?: string;
  groups?: string[];
}

function parseBody(body: unknown): CreatePromptTemplatePayload {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as CreatePromptTemplatePayload;
    } catch {
      return {};
    }
  }
  return body as CreatePromptTemplatePayload;
}

function nextId(): string {
  const max = MOCK_TEMPLATES.reduce((m, t) => {
    const n = parseInt(t.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

function isoNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const adminPromptTemplatesMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: '/admin/prompt-templates',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const team = params['team'];
      const q = (params['q'] ?? params['search'] ?? '').toLowerCase();
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      let rows = [...MOCK_TEMPLATES];
      if (team === '__none__') {
        rows = rows.filter((t) => t.teams.length === 0);
      } else if (team) {
        rows = rows.filter((t) => t.teams.includes(team));
      }
      if (q) {
        rows = rows.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.systemPrompt.toLowerCase().includes(q) ||
            t.teams.some((g) => g.toLowerCase().includes(q)),
        );
      }
      rows.sort((a, b) => {
        const aV = sortField === 'name' ? a.name : (a.updatedAt ?? '');
        const bV = sortField === 'name' ? b.name : (b.updatedAt ?? '');
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const data = rows.slice(start, start + size).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        systemPrompt: t.systemPrompt,
        groups: t.teams,
        updatedAt: t.updatedAt,
      }));
      return [200, { content: data, totalElements: rows.length, number: page, size }];
    },
  },
  {
    method: 'POST',
    match: '/admin/prompt-templates',
    handler: (_url, body) => {
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      if (!name) {
        return [400, { message: 'name is required' }];
      }
      const updatedAt = isoNow();
      const created = {
        id: nextId(),
        tenantId: 'tenant-dev-001',
        name,
        description: (b.description ?? '').trim(),
        systemPrompt: (b.systemPrompt ?? '').trim(),
        groups: b.groups ?? [],
        updatedAt,
      };
      MOCK_TEMPLATES.unshift({
        id: created.id,
        name: created.name,
        description: created.description,
        systemPrompt: created.systemPrompt,
        teams: created.groups,
        updatedAt,
      });
      return [200, created];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/prompt-templates\/[^/]+$/,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_TEMPLATES.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'template not found' }];
      const b = parseBody(body);
      const updatedAt = isoNow();
      const existing = MOCK_TEMPLATES[idx];
      const next = {
        ...existing,
        name: b.name !== undefined ? b.name.trim() : existing.name,
        description: b.description !== undefined ? b.description.trim() : existing.description,
        systemPrompt: b.systemPrompt !== undefined ? b.systemPrompt.trim() : existing.systemPrompt,
        teams: b.groups !== undefined ? b.groups : existing.teams,
        updatedAt,
      };
      MOCK_TEMPLATES[idx] = next;
      return [
        200,
        {
          id: next.id,
          tenantId: 'tenant-dev-001',
          name: next.name,
          description: next.description,
          systemPrompt: next.systemPrompt,
          groups: next.teams,
          updatedAt,
        },
      ];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/prompt-templates\/[^/]+$/,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_TEMPLATES.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'template not found' }];
      MOCK_TEMPLATES.splice(idx, 1);
      return [200, { id }];
    },
  },
];
