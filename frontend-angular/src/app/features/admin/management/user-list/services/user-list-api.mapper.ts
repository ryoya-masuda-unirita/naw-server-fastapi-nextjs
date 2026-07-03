import type { UserApiItem, UserApiResponse } from '@app-types/admin/user.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeRole(role: unknown): UserApiItem['role'] {
  const value = String(role ?? 'user').toLowerCase();
  return value === 'admin' ? 'admin' : 'user';
}

function mapUserItem(item: Record<string, unknown>): UserApiItem {
  const id = String(item['id'] ?? '');
  const userId = String(item['userId'] ?? item['user_id'] ?? id);
  const name = item['name'] != null ? String(item['name']) : undefined;
  const displayName = String(item['displayName'] ?? item['display_name'] ?? name ?? '');

  return {
    id,
    userId,
    displayName,
    name,
    role: normalizeRole(item['role']),
    ...(item['totalCredits'] != null ? { totalCredits: Number(item['totalCredits']) } : {}),
    usedTokens: item['usedTokens'] != null ? Number(item['usedTokens']) : null,
    loginKey: String(item['loginKey'] ?? item['login_key'] ?? ''),
    accountType: (item['accountType'] ??
      item['account_type'] ??
      'none') as UserApiItem['accountType'],
    email: String(item['email'] ?? ''),
    updatedAt: new Date(String(item['updatedAt'] ?? item['updated_at'] ?? Date.now())),
  };
}

/** Maps `GET /admin/users` responses (paged list or legacy `{ data }` shape). */
export function mapUserListResponse(body: unknown): UserApiResponse {
  if (Array.isArray(body)) {
    const data = body.map((item) => mapUserItem(item as Record<string, unknown>));
    return { data, total: data.length, page: 1, size: data.length };
  }

  if (!isRecord(body)) {
    throw new Error('Invalid user list response');
  }

  if ('success' in body && body['success'] === false) {
    throw new Error(String(body['error'] ?? 'Failed to load users'));
  }

  const itemsRaw =
    (Array.isArray(body['contents']) && body['contents']) ||
    (Array.isArray(body['content']) && body['content']) ||
    (Array.isArray(body['data']) && body['data']) ||
    [];

  const data = itemsRaw.map((item) => mapUserItem(item as Record<string, unknown>));
  const total =
    typeof body['totalCount'] === 'number'
      ? body['totalCount']
      : typeof body['totalElements'] === 'number'
        ? body['totalElements']
        : typeof body['total'] === 'number'
          ? body['total']
          : data.length;

  const apiPage = typeof body['page'] === 'number' ? body['page'] : 0;
  const size =
    typeof body['size'] === 'number'
      ? body['size']
      : typeof body['pageSize'] === 'number'
        ? body['pageSize']
        : data.length;

  return {
    data,
    total,
    page: apiPage >= 0 ? apiPage + 1 : 1,
    size,
  };
}
