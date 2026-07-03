import { API_PATHS } from '../../constants/api-paths.config';
import type { MockRoute } from '../api-mock';

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

export const userProfileMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.USERS.PROFILE,
    handler: () => [
      200,
      {
        id: 'mock-user-id',
        loginId: 'mock-user@example.com',
        name: 'モック ユーザー',
        role: 'USER',
        loginKey: null,
        // UsageDialogComponent が参照するため維持
        subscription: {
          id: 'sub-001',
          status: 'active',
          startDate: '2026-04-01',
          endDate: '2027-03-31',
          createdAt: '2026-04-01T00:00:00.000Z',
          updatedAt: '2026-04-01T00:00:00.000Z',
          plan: {
            id: 'plan-standard',
            name: 'Standard',
            maxUsers: 50,
            maxCreditsPerMonth: 500000,
            maxCreditsPerDay: 20000,
            alertPercentage: 80,
            dailyAlertPercentage: 75,
          },
        },
      },
    ],
  },
  {
    method: 'PATCH',
    match: API_PATHS.USERS.PROFILE,
    handler: (_url, body) => {
      const b = parseBody(body);
      if (!b['password']) return [400, { message: 'リクエスト不正' }];
      return [
        200,
        {
          id: 'mock-user-id',
          loginId: 'mock-user@example.com',
          name: 'モック ユーザー',
          role: 'USER',
          loginKey: null,
        },
      ];
    },
  },
];
