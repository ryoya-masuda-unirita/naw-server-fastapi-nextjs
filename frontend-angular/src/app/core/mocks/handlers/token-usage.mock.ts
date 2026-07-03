import { API_PATHS } from '../../constants/api-paths.config';
import { buildTokenUsageDateRange } from '../../utils/api-datetime.util';
import {
  MOCK_TOKEN_USAGE_SUMMARY,
  MOCK_TOKEN_USAGE_TODAY,
} from '../../constants/mock-data/token-usages.mock';
import { MOCK_USAGE_HISTORY } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

export const tokenUsageMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.TOKEN_USAGES.GET,
    handler: (_url, _body, params) => {
      const todayRange = buildTokenUsageDateRange('today');
      const isToday = params['from'] === todayRange.from;
      return [200, isToday ? MOCK_TOKEN_USAGE_TODAY : MOCK_TOKEN_USAGE_SUMMARY];
    },
  },
  {
    method: 'GET',
    match: API_PATHS.ADMIN.HISTORIES.LIST,
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '1', 10);
      const size = parseInt(params['size'] ?? '20', 10);
      const userId = params['userId'] ?? '';
      const filtered = userId
        ? MOCK_USAGE_HISTORY.filter((h) => h.user.toLowerCase().includes(userId.toLowerCase()))
        : MOCK_USAGE_HISTORY;
      const start = (page - 1) * size;
      return [200, filtered.slice(start, start + size)];
    },
  },
];
