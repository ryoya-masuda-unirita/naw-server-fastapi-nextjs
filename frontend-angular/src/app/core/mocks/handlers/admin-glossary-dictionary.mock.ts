import type {
  GlossaryDictionaryAssistantRow,
  GlossaryWordTableRow,
} from '@app-types/admin/glossary-dictionary.types';
import {
  ensureGlossaryDictionaryAssistants,
  ensureGlossaryDictionaryWords,
  MOCK_GLOSSARY_DICTIONARY_ASSISTANTS,
  MOCK_GLOSSARY_DICTIONARY_WORDS,
} from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return body as Record<string, unknown>;
}

function formatDateLabel(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}/${m}/${day} ${h}:${min}`;
}

const wordsListRe = /^\/admin\/glossary\/terms\/([^/]+)\/words$/;
const wordsBulkRe = /^\/admin\/glossary\/terms\/([^/]+)\/words\/bulk-delete$/;
const wordDetailRe = /^\/admin\/glossary\/terms\/([^/]+)\/words\/([^/]+)$/;
const assistantsListRe = /^\/admin\/glossary\/terms\/([^/]+)\/assistants$/;
const assistantsBulkRe = /^\/admin\/glossary\/terms\/([^/]+)\/assistants\/bulk-delete$/;

export const adminGlossaryDictionaryMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: wordsListRe,
    handler: (url) => {
      const m = url.match(wordsListRe);
      const glossaryId = m?.[1] ?? '';
      console.log('[Mock][Glossary] DICTIONARY_WORDS_LIST', { glossaryId });
      const data = [...ensureGlossaryDictionaryWords(glossaryId)];
      return [200, { data, total: data.length }];
    },
  },
  {
    method: 'PATCH',
    match: wordDetailRe,
    handler: (url, body) => {
      const m = url.match(wordDetailRe);
      const glossaryId = m?.[1] ?? '';
      const wordId = m?.[2] ?? '';
      const b = parseBody(body);
      console.log('[Mock][Glossary] DICTIONARY_WORD_UPDATE', { glossaryId, wordId, body: b });
      const rows = ensureGlossaryDictionaryWords(glossaryId);
      const idx = rows.findIndex((r) => r.id === wordId);
      if (idx === -1) return [404, { message: 'word not found' }];
      const tags = b['tags'] as string[] | undefined;
      const next: GlossaryWordTableRow = {
        ...rows[idx],
        name: b['name'] !== undefined ? String(b['name']).trim() : rows[idx].name,
        description:
          b['description'] !== undefined ? String(b['description']).trim() : rows[idx].description,
        tags: Array.isArray(tags) ? tags : rows[idx].tags,
        dateLabel: formatDateLabel(new Date()),
      };
      rows[idx] = next;
      return [200, { data: next }];
    },
  },
  {
    method: 'DELETE',
    match: wordDetailRe,
    handler: (url) => {
      const m = url.match(wordDetailRe);
      const glossaryId = m?.[1] ?? '';
      const wordId = m?.[2] ?? '';
      console.log('[Mock][Glossary] DICTIONARY_WORD_DELETE', { glossaryId, wordId });
      const rows = ensureGlossaryDictionaryWords(glossaryId);
      const idx = rows.findIndex((r) => r.id === wordId);
      if (idx === -1) return [404, { message: 'word not found' }];
      rows.splice(idx, 1);
      return [200, { data: { id: wordId } }];
    },
  },
  {
    method: 'POST',
    match: wordsBulkRe,
    handler: (url, body) => {
      const m = url.match(wordsBulkRe);
      const glossaryId = m?.[1] ?? '';
      const b = parseBody(body);
      const ids = (b['ids'] as string[]) ?? [];
      console.log('[Mock][Glossary] DICTIONARY_WORDS_BULK_DELETE', { glossaryId, ids });
      const rows = ensureGlossaryDictionaryWords(glossaryId);
      const idSet = new Set(ids);
      MOCK_GLOSSARY_DICTIONARY_WORDS[glossaryId] = rows.filter((r) => !idSet.has(r.id));
      return [200, { data: { deleted: ids.length } }];
    },
  },
  {
    method: 'GET',
    match: assistantsListRe,
    handler: (url) => {
      const m = url.match(assistantsListRe);
      const glossaryId = m?.[1] ?? '';
      console.log('[Mock][Glossary] DICTIONARY_ASSISTANTS_LIST', { glossaryId });
      const data = [...ensureGlossaryDictionaryAssistants(glossaryId)];
      return [200, { data, total: data.length }];
    },
  },
  {
    method: 'POST',
    match: assistantsListRe,
    handler: (url, body) => {
      const m = url.match(assistantsListRe);
      const glossaryId = m?.[1] ?? '';
      const b = parseBody(body);
      const assistantIds = (b['assistantIds'] as string[]) ?? [];
      console.log('[Mock][Glossary] DICTIONARY_ASSISTANTS_ADD', { glossaryId, assistantIds });
      const rows = ensureGlossaryDictionaryAssistants(glossaryId);
      const now = Date.now();
      const added: GlossaryDictionaryAssistantRow[] = assistantIds.map((aid, i) => ({
        id: `add-${now}-${i}-${aid}`,
        name: `追加アシスタント (${aid})`,
        description: 'モックで追加されたアシスタントです',
        server: 'クラウド(一般)',
        model: 'gpt-4o-mini-2024-07-18',
        category: 'カテゴリカテゴリ',
        history: 'ON',
      }));
      rows.unshift(...added);
      return [201, { data: added }];
    },
  },
  {
    method: 'POST',
    match: assistantsBulkRe,
    handler: (url, body) => {
      const m = url.match(assistantsBulkRe);
      const glossaryId = m?.[1] ?? '';
      const b = parseBody(body);
      const ids = (b['ids'] as string[]) ?? [];
      console.log('[Mock][Glossary] DICTIONARY_ASSISTANTS_BULK_DELETE', { glossaryId, ids });
      const rows = ensureGlossaryDictionaryAssistants(glossaryId);
      const idSet = new Set(ids);
      MOCK_GLOSSARY_DICTIONARY_ASSISTANTS[glossaryId] = rows.filter((r) => !idSet.has(r.id));
      return [200, { data: { deleted: ids.length } }];
    },
  },
];
