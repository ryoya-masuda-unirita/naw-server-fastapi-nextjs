import { MockRoute } from '../api-mock';
import { MOCK_TEMPLATES } from '../admin-mock-data';

export const promptTemplatesMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: '/prompt-templates',
    handler: (_url, _body, params) => {
      const size = parseInt(params['size'] ?? '10', 10);
      const page = parseInt(params['page'] ?? '0', 10);

      const rows = MOCK_TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        systemPrompt: t.systemPrompt,
      }));

      if (size === 0) {
        return [200, { content: rows, totalElements: rows.length, number: 0, size: 0 }];
      }

      const start = page * size;
      const content = rows.slice(start, start + size);
      return [200, { content, totalElements: rows.length, number: page, size }];
    },
  },
];
