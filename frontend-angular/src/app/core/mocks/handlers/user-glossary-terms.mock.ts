import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { API_PATHS } from '@core/constants/api-paths.config';
import { MOCK_GLOSSARY_TERMS } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

function filterAndSort(params: Record<string, string>): GlossaryItem[] {
  const category = params['category'] ?? '';
  const q = (params['q'] ?? params['search'] ?? '').toLowerCase();
  const sortField = params['sortField'] ?? '';
  const sortOrder = (params['sortOrder'] ?? 'desc') === 'asc' ? 1 : -1;

  let rows = [...MOCK_GLOSSARY_TERMS];
  if (category) rows = rows.filter((item) => item.category === category);
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
  `^${API_PATHS.USER_GLOSSARY.TERMS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^/]+$`,
);

export const userGlossaryTermsMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.USER_GLOSSARY.TERMS,
    handler: (_url, _body, params) => {
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
];
