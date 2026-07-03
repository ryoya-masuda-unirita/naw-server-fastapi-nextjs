import type {
  UserApiItem,
  UserApiResponse,
  UserFilter,
  UserRoleUi,
} from '@app-types/admin/user.types';

/** Jackson `UserResponse` (subset; extra fields tolerated). */
interface SpringUserRow {
  loginId?: string;
  id?: string | number;
  name?: string;
  displayName?: string;
  role?: string;
  totalCredits?: number;
  usedTokens?: number | null;
  loginKey?: string | null;
  accountType?: string;
  email?: string;
  updatedAt?: string;
}

interface SpringPageUser {
  content: SpringUserRow[];
  totalElements: number;
  size: number;
  number: number;
}

interface LegacyListBody {
  data?: SpringUserRow[];
  total?: number;
  page?: number;
  size?: number;
}

function isSpringPage(body: unknown): body is SpringPageUser {
  return (
    typeof body === 'object' &&
    body !== null &&
    'content' in body &&
    Array.isArray((body as SpringPageUser).content) &&
    typeof (body as SpringPageUser).totalElements === 'number'
  );
}

/** Maps API enum (`ADMIN` | `USER` | `SYSTEM`) to UI role. */
export function normalizeApiRoleToUi(role: unknown): UserRoleUi {
  const u = String(role ?? 'USER').toUpperCase();
  if (u === 'ADMIN') return 'admin';
  if (u === 'SYSTEM') return 'system';
  return 'user';
}

export function springUserRowToUserApiItem(row: SpringUserRow): UserApiItem {
  const id = String(row.id ?? '').trim();
  const loginId = String(row.loginId ?? '').trim();
  const display = String(row.name ?? row.displayName ?? '').trim();
  const at = row.accountType;
  const accountType: UserApiItem['accountType'] =
    at === 'google' || at === 'microsoft' || at === 'none' ? at : 'none';
  const role = normalizeApiRoleToUi(row.role);
  const lk = row.loginKey;
  const totalCredits = row.totalCredits != null ? Number(row.totalCredits) : undefined;
  return {
    id,
    userId: loginId,
    displayName: display,
    role,
    ...(totalCredits != null ? { totalCredits } : {}),
    usedTokens: row.usedTokens ?? null,
    loginKey: lk == null ? '' : String(lk),
    accountType,
    email: String(row.email ?? ''),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : new Date(),
  };
}

/** Spring `Page<UserResponse>` → internal `UserApiResponse` (`data` / `total` / 1-based `page`). */
export function normalizeAdminUsersListBody(raw: unknown, filter: UserFilter): UserApiResponse {
  if (isSpringPage(raw)) {
    return {
      data: raw.content.map(springUserRowToUserApiItem),
      total: raw.totalElements,
      page: raw.number + 1,
      size: raw.size,
    };
  }
  const legacy = raw as LegacyListBody;
  if (legacy.data && typeof legacy.total === 'number') {
    return {
      data: legacy.data.map(springUserRowToUserApiItem),
      total: legacy.total,
      page: (legacy.page ?? 0) + 1,
      size: legacy.size ?? legacy.data.length,
    };
  }
  return { data: [], total: 0, page: 1, size: filter.pageSize };
}
