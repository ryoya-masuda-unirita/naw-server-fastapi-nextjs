import { API_PATHS } from '../../constants/api-paths.config';
import { MOCK_ASSISTANTS } from '../../constants/mock-data/assistants.mock';
import { MOCK_TEAMS } from '../../constants/mock-data/teams.mock';
import type { MockRoute } from '../api-mock';

export const commonPageMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.GROUPS.LIST,
    handler: () => [200, { data: MOCK_TEAMS, total: MOCK_TEAMS.length }],
  },
  {
    method: 'GET',
    match: API_PATHS.ASSISTANTS.LIST,
    handler: () => [200, { data: MOCK_ASSISTANTS, total: MOCK_ASSISTANTS.length }],
  },
];
