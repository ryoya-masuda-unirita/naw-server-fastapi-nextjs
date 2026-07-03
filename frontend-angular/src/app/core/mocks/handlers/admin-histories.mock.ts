import { MockRoute } from '../api-mock';
import { MOCK_CHAT_HISTORY } from '../../constants/mock-data/chat-history.mock';

export const adminHistoriesMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: '/admin/histories',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const userId = params['userId'];
      const from = params['createdAtFrom'];
      const to = params['createdAtTo'];
      const name = (params['name'] ?? '').toLowerCase();
      const orderBy = params['orderBy'] ?? 'updatedAt';
      const reverse = params['reverse'] !== 'false';
      const sortField =
        orderBy === 'name' ? 'roomName' : orderBy === 'userName' ? 'userName' : 'updatedAt';
      const sortDir = reverse ? 'desc' : 'asc';

      let rows = [...MOCK_CHAT_HISTORY];
      if (userId) rows = rows.filter((r) => r.userId === userId);
      if (name) {
        rows = rows.filter(
          (r) =>
            r.name.toLowerCase().includes(name) || (r.userName ?? '').toLowerCase().includes(name),
        );
      }
      if (from) rows = rows.filter((r) => r.updatedAt >= from);
      if (to) rows = rows.filter((r) => r.updatedAt <= `${to}T23:59:59`);

      rows.sort((a, b) => {
        const aV =
          sortField === 'userName'
            ? (a.userName ?? '')
            : sortField === 'roomName'
              ? a.name
              : a.updatedAt;
        const bV =
          sortField === 'userName'
            ? (b.userName ?? '')
            : sortField === 'roomName'
              ? b.name
              : b.updatedAt;
        if (aV === bV) return 0;
        const cmp = aV > bV ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const content = rows.slice(start, start + size);
      return [200, { content, totalElements: rows.length, number: page, size }];
    },
  },
];
