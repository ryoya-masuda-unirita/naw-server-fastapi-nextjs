import { STORAGE_KEYS } from '@core/constants';
import { MOCK_ACCOUNTS } from '@features/auth/data/mock-accounts';
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

export const authMockRoutes: MockRoute[] = [
  {
    method: 'POST',
    match: '/auth/login',
    handler: (_url, body) => {
      const { username, password } = parseBody(body) as { username?: string; password?: string };
      const account = MOCK_ACCOUNTS.find(
        (acc) => acc.username === username && acc.password === password,
      );
      if (!account) {
        return [
          403,
          { timestamp: new Date().toISOString(), message: '入力内容に誤りがあります。' },
        ];
      }
      if (account.requiresPasswordReset) {
        return [
          200,
          {
            id: account.username,
            name: account.name,
            role: account.role,
            loginStatus: 'REQUIRES_PASSWORD_RESET',
            reason: account.passwordResetReason ?? 'INITIAL',
          },
        ];
      }
      const token = `mock-token-${account.id}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const groups =
        account.role === 'USER'
          ? [{ groupId: '1', groupAdmin: true }]
          : [{ groupId: '1', groupAdmin: true }];
      return [
        200,
        {
          id: account.username,
          name: account.name,
          role: account.role,
          loginStatus: 'SUCCESS',
          token,
          groups,
        },
      ];
    },
  },
  {
    method: 'GET',
    match: '/auth',
    handler: () => {
      const userJson = sessionStorage.getItem(STORAGE_KEYS.USER);
      const tenantId = sessionStorage.getItem(STORAGE_KEYS.TENANT_ID) ?? 'mock-tenant';
      if (!userJson) return [401, { error: 'No valid session' }];
      const user = JSON.parse(userJson) as {
        id?: string;
        name?: string;
        role: string;
        groups?: { groupId: string; groupAdmin: boolean }[];
      };
      return [
        200,
        {
          id: user.id,
          name: user.name,
          role: user.role.toUpperCase(),
          tenant_id: tenantId,
          groups: user.groups ?? [],
        },
      ];
    },
  },
  {
    method: 'POST',
    match: '/auth/logout',
    handler: () => [200, { timestamp: new Date().toISOString(), message: 'Logout successful' }],
  },
  {
    method: 'POST',
    match: '/auth/password/reset',
    handler: (_url, body) => {
      const { username, oldPassword } = parseBody(body) as {
        username?: string;
        oldPassword?: string;
      };
      const account = MOCK_ACCOUNTS.find(
        (acc) => acc.username === username && acc.password === oldPassword,
      );
      if (!account) {
        return [403, { message: 'ログインIDまたは旧パスワードが正しくありません。' }];
      }
      const token = `mock-token-reset-${account.id}-${Date.now()}`;
      const groups =
        account.role === 'USER'
          ? [{ groupId: '1', groupAdmin: true }]
          : [{ groupId: '1', groupAdmin: true }];
      return [
        200,
        {
          id: account.username,
          name: account.name,
          role: account.role,
          token,
          groups,
        },
      ];
    },
  },
];
