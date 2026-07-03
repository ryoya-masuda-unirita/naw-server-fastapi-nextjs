import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_GLOSSARY_TAG_ITEMS } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

interface GlossaryTagPayload {
  name?: string;
  description?: string;
}

function parseBody(body: unknown): GlossaryTagPayload {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as GlossaryTagPayload;
    } catch {
      return {};
    }
  }
  return body as GlossaryTagPayload;
}

function nextId(): string {
  const max = MOCK_GLOSSARY_TAG_ITEMS.reduce((m, t) => {
    const n = parseInt(t.id, 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return String(max + 1);
}

const tagDetailMatch = new RegExp(
  `^${API_PATHS.GLOSSARY.TAGS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
);

export const adminGlossaryTagsMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.GLOSSARY.TAGS,
    handler: () => {
      console.log('[Mock][Glossary] TAGS_LIST');
      const data = MOCK_GLOSSARY_TAG_ITEMS.map((t) => ({
        ...t,
        updatedDate: t.updatedDate instanceof Date ? t.updatedDate.toISOString() : t.updatedDate,
      }));
      return [200, { data, total: data.length }];
    },
  },
  {
    method: 'POST',
    match: API_PATHS.GLOSSARY.TAGS,
    handler: (_url, body) => {
      const b = parseBody(body);
      console.log('[Mock][Glossary] TAG_CREATE', { body: b });
      const name = (b.name ?? '').trim();
      if (!name) return [400, { message: 'name is required' }];

      const created: GlossaryTagItem = {
        id: nextId(),
        name,
        description: (b.description ?? '').trim() || undefined,
        updatedDate: new Date(),
        updatedBy: '名前名前',
      };
      MOCK_GLOSSARY_TAG_ITEMS.unshift(created);
      return [
        201,
        {
          data: { ...created, updatedDate: created.updatedDate.toISOString() },
        },
      ];
    },
  },
  {
    method: 'PATCH',
    match: tagDetailMatch,
    handler: (url, body) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_GLOSSARY_TAG_ITEMS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'tag not found' }];

      const b = parseBody(body);
      console.log('[Mock][Glossary] TAG_UPDATE', { id, body: b });
      const existing = MOCK_GLOSSARY_TAG_ITEMS[idx];
      const next: GlossaryTagItem = {
        ...existing,
        name: b.name !== undefined ? b.name.trim() : existing.name,
        description:
          b.description !== undefined ? b.description.trim() || undefined : existing.description,
        updatedDate: new Date(),
        updatedBy: '名前名前',
      };
      MOCK_GLOSSARY_TAG_ITEMS[idx] = next;
      return [200, { data: { ...next, updatedDate: next.updatedDate.toISOString() } }];
    },
  },
  {
    method: 'DELETE',
    match: tagDetailMatch,
    handler: (url) => {
      const id = url.split('/').pop() ?? '';
      const idx = MOCK_GLOSSARY_TAG_ITEMS.findIndex((t) => t.id === id);
      if (idx === -1) return [404, { message: 'tag not found' }];
      console.log('[Mock][Glossary] TAG_DELETE', { id });
      MOCK_GLOSSARY_TAG_ITEMS.splice(idx, 1);
      return [200, { data: { id } }];
    },
  },
];
