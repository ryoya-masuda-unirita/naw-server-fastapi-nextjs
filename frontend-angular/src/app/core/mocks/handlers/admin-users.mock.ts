import type { UserApiRole } from '@app-types/admin/user.types';
import { normalizeApiRoleToUi } from '@features/admin/management/user-list/utils/admin-users-api-normalize';
import { MOCK_ADMIN_USERS } from '../admin-mock-data';
import { MockRoute } from '../api-mock';

interface CreateUserBody {
  loginId?: string;
  id?: string;
  name?: string;
  password?: string;
  role?: string;
  loginKey?: string;
  tenantId?: string;
  resetPassword?: boolean;
}

function parseBody(body: unknown): CreateUserBody {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as CreateUserBody;
    } catch {
      return {};
    }
  }
  return body as CreateUserBody;
}

function nextId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Path segment is always `loginId`, never UUID. */
function findUserIndexByLoginId(loginId: string): number {
  return MOCK_ADMIN_USERS.findIndex((u) => u.userId === loginId);
}

export const adminUsersMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: '/admin/users',
    handler: (_url, _body, params) => {
      const page = parseInt(params['page'] ?? '0', 10);
      const size = parseInt(params['size'] ?? '10', 10);
      const searchText = (params['searchText'] ?? '').toLowerCase();
      const roleParam = (params['role'] ?? '').toUpperCase();
      const includeUsage = params['includeUsage'] === 'true';
      const [sortField, sortDir] = (params['sort'] ?? 'updatedAt,desc').split(',');

      let rows = [...MOCK_ADMIN_USERS];

      if (searchText) {
        rows = rows.filter(
          (u) =>
            u.displayName.toLowerCase().includes(searchText) ||
            u.userId.toLowerCase().includes(searchText) ||
            u.email.toLowerCase().includes(searchText),
        );
      }

      const roleUi =
        roleParam === 'ADMIN'
          ? 'admin'
          : roleParam === 'SYSTEM'
            ? 'system'
            : roleParam === 'USER'
              ? 'user'
              : '';
      if (roleUi) {
        rows = rows.filter((u) => u.role === roleUi);
      }

      rows.sort((a, b) => {
        let aV: unknown = a.updatedAt;
        let bV: unknown = b.updatedAt;

        if (sortField === 'displayName' || sortField === 'name') {
          aV = a.displayName;
          bV = b.displayName;
        } else if (sortField === 'role') {
          aV = a.role;
          bV = b.role;
        } else if (sortField === 'totalCredits') {
          aV = a.totalCredits;
          bV = b.totalCredits;
        } else if (sortField === 'updatedAt') {
          aV = a.updatedAt;
          bV = b.updatedAt;
        }

        if (aV === bV) {
          if (sortField === 'totalCredits') {
            const nameCmp = a.displayName.localeCompare(b.displayName);
            return sortDir === 'asc' ? nameCmp : -nameCmp;
          }
          return 0;
        }
        const cmp = aV! > bV! ? 1 : -1;
        return sortDir === 'asc' ? cmp : -cmp;
      });

      const start = page * size;
      const slice = rows.slice(start, start + size);
      const content = slice.map((u) => {
        const row: Record<string, unknown> = {
          loginId: u.userId,
          id: u.id,
          name: u.displayName,
          displayName: u.displayName,
          role: u.role.toUpperCase(),
          loginKey: u.loginKey,
          accountType: u.accountType,
          email: u.email,
          updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt,
        };
        if (includeUsage) {
          row['totalCredits'] = u.totalCredits;
        }
        return row;
      });

      return [
        200,
        {
          content,
          totalElements: rows.length,
          number: page,
          size,
          first: page === 0,
          last: start + size >= rows.length,
        },
      ];
    },
  },
  {
    method: 'POST',
    match: '/admin/users',
    handler: (_url, body) => {
      const b = parseBody(body);
      const name = (b.name ?? '').trim();
      const loginId = (b.loginId ?? '').trim();
      if (!name || !loginId) {
        return [400, { message: 'name and loginId are required' }];
      }

      const roleUi = normalizeApiRoleToUi(b.role);
      const created = {
        id: nextId(),
        userId: loginId,
        displayName: name,
        role: roleUi,
        totalCredits: 0,
        loginKey: '*****',
        accountType: 'none' as const,
        email: '',
        updatedAt: new Date(),
      };

      MOCK_ADMIN_USERS.unshift(created);

      const passwordExpiredAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      return [
        200,
        {
          loginId: created.userId,
          id: created.id,
          name: created.displayName,
          displayName: created.displayName,
          role: created.role.toUpperCase() as UserApiRole,
          loginKey: created.loginKey,
          isRequiredPasswordReset: true,
          initialPassword: 'MockPass1!',
          passwordExpiredAt,
        },
      ];
    },
  },
  {
    method: 'PATCH',
    match: /^\/admin\/users\/[^/]+$/,
    handler: (url, body) => {
      const pathLoginId = decodeURIComponent(url.split('/').pop() ?? '');
      const idx = findUserIndexByLoginId(pathLoginId);
      if (idx === -1) return [404, { message: 'user not found' }];

      const b = parseBody(body);
      const existing = MOCK_ADMIN_USERS[idx];
      const updatedAt = new Date();

      const next = {
        ...existing,
        displayName: b.name !== undefined ? b.name.trim() : existing.displayName,
        role: b.role !== undefined ? normalizeApiRoleToUi(b.role) : existing.role,
        updatedAt,
        loginKey: '*****',
      };

      MOCK_ADMIN_USERS[idx] = next;

      const resetPassword = b.resetPassword === true;
      const passwordExpiredAt = resetPassword
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      return [
        200,
        {
          loginId: next.userId,
          id: next.id,
          name: next.displayName,
          displayName: next.displayName,
          role: next.role.toUpperCase() as UserApiRole,
          loginKey: '*****',
          isRequiredPasswordReset: resetPassword,
          initialPassword: resetPassword ? 'MockPass1!' : null,
          passwordExpiredAt,
        },
      ];
    },
  },
  {
    method: 'DELETE',
    match: /^\/admin\/users\/[^/]+$/,
    handler: (url) => {
      const pathLoginId = decodeURIComponent(url.split('/').pop() ?? '');
      const idx = findUserIndexByLoginId(pathLoginId);
      if (idx === -1) return [404, { message: 'user not found' }];
      MOCK_ADMIN_USERS.splice(idx, 1);
      return [204, null];
    },
  },
];
