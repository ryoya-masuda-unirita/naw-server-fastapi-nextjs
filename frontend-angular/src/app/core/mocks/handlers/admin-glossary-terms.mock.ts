import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_GLOSSARY_TERMS } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

interface GlossaryTermPayload {
  name?: string;
  definition?: string;
  category?: string;
  assistant?: string;
  tags?: string[];
}

function parseBody(body: unknown): GlossaryTermPayload {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as GlossaryTermPayload;
    } catch {
      return {};
    }
  }
  return body as GlossaryTermPayload;
}

function nextId(): string {
  const max = MOCK_GLOSSARY_TERMS.reduce((m, t) => {
    const n = parseInt(t.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

function filterAndSort(params: Record<string, string>): GlossaryItem[] {
  const category = params['category'] ?? '';
  const q = (params['q'] ?? params['search'] ?? '').toLowerCase();
  const sortField = params['sortField'] ?? '';
  const sortOrder = (params['sortOrder'] ?? 'desc') === 'asc' ? 1 : -1;

  let rows = [...MOCK_GLOSSARY_TERMS];
  if (category) {
    rows = rows.filter((item) => item.category === category);
  }
  if (q) {
    rows = rows.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.definition.toLowerCase().includes(q) ||
        item.creator.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  if (sortField) {
    rows.sort((a, b) => {
      if (sortField === 'updatedAt') {
        return (a.editedDate.getTime() - b.editedDate.getTime()) * sortOrder;
      }
      if (sortField === 'term') {
        return a.name.localeCompare(b.name) * sortOrder;
      }
      return 0;
    });
  }
  return rows;
}

const termDetailMatch = new RegExp(
  `^${API_PATHS.GLOSSARY.TERMS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
);

export const adminGlossaryTermsMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.GLOSSARY.TERMS,
    handler: (_url, _body, params) => {
      console.log('[Mock][Glossary] TERMS_LIST', { params });
      const page = Math.max(1, parseInt(params['page'] ?? '1', 10));
      const size = parseInt(params['pageSize'] ?? params['size'] ?? '10', 10);
      const rows = filterAndSort(params);
      const start = (page - 1) * size;
      const data = rows.slice(start, start + size).map((item) => ({
        ...item,
        editedDate:
          item.editedDate instanceof Date ? item.editedDate.toISOString() : item.editedDate,
      }));
      return [200, { data, total: rows.length, page, size }];
    },
  },
  {
    method: 'GET',
    match: termDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const item = MOCK_GLOSSARY_TERMS.find((t) => t.id === id);
      if (!item) return [404, { message: 'term not found' }];
      console.log('[Mock][Glossary] TERM_GET', { id });
      return [
        200,
        {
          ...item,
          editedDate:
            item.editedDate instanceof Date ? item.editedDate.toISOString() : item.editedDate,
        },
      ];
    },
  },
  {
    method: 'POST',
    match: API_PATHS.GLOSSARY.TERMS,
    handler: (_url, body) => {
      const b = parseBody(body);
      console.log('[Mock][Glossary] TERM_CREATE', { body: b });
      const name = (b.name ?? '').trim();
      if (!name) {
        return [400, { message: 'name is required' }];
      }
      const created: GlossaryItem = {
        id: nextId(),
        name,
        definition: (b.definition ?? '').trim(),
        tags: b.tags ?? [],
        editedDate: new Date(),
        creator: '名前名者名前',
        category: (b.category ?? '全ての関語').trim() || '全ての関語',
        assistant: (b.assistant ?? '').trim(),
      };
      MOCK_GLOSSARY_TERMS.unshift(created);
      return [
        200,
        {
          ...created,
          editedDate: created.editedDate.toISOString(),
        },
      ];
    },
  },
  {
    method: 'PATCH',
    match: termDetailMatch,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_GLOSSARY_TERMS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'term not found' }];
      const b = parseBody(body);
      console.log('[Mock][Glossary] TERM_UPDATE', { id, body: b });
      const existing = MOCK_GLOSSARY_TERMS[idx];
      const next: GlossaryItem = {
        ...existing,
        name: b.name !== undefined ? b.name.trim() : existing.name,
        definition: b.definition !== undefined ? b.definition.trim() : existing.definition,
        category: b.category !== undefined ? b.category.trim() : existing.category,
        assistant: b.assistant !== undefined ? b.assistant.trim() : existing.assistant,
        tags: b.tags !== undefined ? b.tags : existing.tags,
        editedDate: new Date(),
      };
      MOCK_GLOSSARY_TERMS[idx] = next;
      return [
        200,
        {
          ...next,
          editedDate: next.editedDate.toISOString(),
        },
      ];
    },
  },
  {
    method: 'DELETE',
    match: termDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_GLOSSARY_TERMS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'term not found' }];
      console.log('[Mock][Glossary] TERM_DELETE', { id });
      MOCK_GLOSSARY_TERMS.splice(idx, 1);
      return [200, { id }];
    },
  },
];
