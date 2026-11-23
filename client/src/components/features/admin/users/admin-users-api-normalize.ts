import type {
  UserApiItem,
  UserApiResponse,
  UserFilter,
  UserRoleUi,
} from '@/types/admin/user.types';

// 移植元 user-list/utils/admin-users-api-normalize.ts。
// backend は #309 で移植元 server の応答（`number`・`hasLoginKey`）に揃える予定。
// それまでの backend（`page`・`loginKey`）の応答も読めるようにしてある（docs/issue-125/03_詳細設計.md）。

/** Jackson `UserResponse` の一部（余分な項目は無視する） */
interface SpringUserRow {
  loginId?: string;
  id?: string | number;
  name?: string;
  displayName?: string;
  role?: string;
  totalCredits?: number;
  usedTokens?: number | null;
  hasLoginKey?: boolean;
  /** 現在の backend が返す保存値（#309 で `hasLoginKey` だけになる）。値は読まず、有無だけ見る */
  loginKey?: string | null;
  accountType?: string;
  email?: string;
  updatedAt?: string;
}

interface SpringPageUser {
  content: SpringUserRow[];
  totalElements: number;
  size: number;
  /** 移植元 server（Spring `Page`）の 0 始まりのページ番号 */
  number?: number;
  /** 現在の backend が `number` の代わりに返す 0 始まりのページ番号 */
  page?: number;
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

/** API の enum（`ADMIN` | `USER` | `SYSTEM`）を画面の権限に直す */
export function normalizeApiRoleToUi(role: unknown): UserRoleUi {
  const upper = String(role ?? 'USER').toUpperCase();
  if (upper === 'ADMIN') return 'admin';
  if (upper === 'SYSTEM') return 'system';
  return 'user';
}

function resolveHasLoginKey(row: SpringUserRow): boolean {
  if (row.hasLoginKey !== undefined) return row.hasLoginKey === true;
  return typeof row.loginKey === 'string' && row.loginKey !== '';
}

export function springUserRowToUserApiItem(row: SpringUserRow): UserApiItem {
  const id = String(row.id ?? '').trim();
  const loginId = String(row.loginId ?? '').trim();
  const display = String(row.name ?? row.displayName ?? '').trim();
  const accountTypeRaw = row.accountType;
  const accountType: UserApiItem['accountType'] =
    accountTypeRaw === 'google' || accountTypeRaw === 'microsoft' || accountTypeRaw === 'none'
      ? accountTypeRaw
      : 'none';
  const totalCredits = row.totalCredits != null ? Number(row.totalCredits) : undefined;

  return {
    id,
    userId: loginId,
    displayName: display,
    role: normalizeApiRoleToUi(row.role),
    ...(totalCredits != null ? { totalCredits } : {}),
    usedTokens: row.usedTokens ?? null,
    hasLoginKey: resolveHasLoginKey(row),
    accountType,
    email: String(row.email ?? ''),
    updatedAt: row.updatedAt ? new Date(String(row.updatedAt)) : new Date(),
  };
}

/** `GET /api/admin/users` の応答を画面用の `UserApiResponse`（`data`・`total`・1 始まりの `page`）にする */
export function normalizeAdminUsersListBody(raw: unknown, filter: UserFilter): UserApiResponse {
  if (isSpringPage(raw)) {
    return {
      data: raw.content.map(springUserRowToUserApiItem),
      total: raw.totalElements,
      page: (raw.number ?? raw.page ?? 0) + 1,
      size: raw.size,
    };
  }

  const legacy = raw as LegacyListBody | null;
  if (legacy?.data && typeof legacy.total === 'number') {
    return {
      data: legacy.data.map(springUserRowToUserApiItem),
      total: legacy.total,
      page: (legacy.page ?? 0) + 1,
      size: legacy.size ?? legacy.data.length,
    };
  }
  return { data: [], total: 0, page: 1, size: filter.pageSize };
}
