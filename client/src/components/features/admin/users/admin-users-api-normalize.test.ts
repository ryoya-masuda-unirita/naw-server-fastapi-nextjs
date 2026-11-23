import { describe, expect, test } from 'vitest';
import type { UserFilter } from '@/types/admin/user.types';
import { normalizeAdminUsersListBody } from './admin-users-api-normalize';

const FIXTURE_FILTER: UserFilter = { pageSize: 10, pageIndex: 1 };

describe('normalizeAdminUsersListBody', () => {
  test('移植元 server の Page（number・hasLoginKey）を読めること', () => {
    const result = normalizeAdminUsersListBody(
      {
        content: [{ id: 'u1', loginId: 'taro', name: '太郎', role: 'ADMIN', hasLoginKey: true, totalCredits: 5 }],
        totalElements: 21,
        size: 10,
        number: 2,
      },
      FIXTURE_FILTER
    );

    expect(result.total).toBe(21);
    expect(result.page).toBe(3);
    expect(result.data[0]).toMatchObject({
      id: 'u1',
      userId: 'taro',
      displayName: '太郎',
      role: 'admin',
      hasLoginKey: true,
      totalCredits: 5,
    });
  });

  test('現在の backend（page・loginKey）の応答も読めること', () => {
    const result = normalizeAdminUsersListBody(
      {
        content: [
          { id: 'u1', loginId: 'a', name: 'A', role: 'USER', loginKey: 'secret' },
          { id: 'u2', loginId: 'b', name: 'B', role: 'SYSTEM', loginKey: null },
        ],
        totalElements: 2,
        size: 10,
        page: 1,
      },
      FIXTURE_FILTER
    );

    expect(result.page).toBe(2);
    expect(result.data.map((item) => item.hasLoginKey)).toEqual([true, false]);
    expect(result.data[1].role).toBe('system');
  });

  test('{ data, total } の旧形式も読めること', () => {
    const result = normalizeAdminUsersListBody(
      { data: [{ id: 'u1', loginId: 'a', name: 'A', role: 'USER' }], total: 1 },
      FIXTURE_FILTER
    );

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  test('読めない形のときは空の一覧にすること', () => {
    const result = normalizeAdminUsersListBody({ unexpected: true }, FIXTURE_FILTER);

    expect(result).toEqual({ data: [], total: 0, page: 1, size: 10 });
  });
});
