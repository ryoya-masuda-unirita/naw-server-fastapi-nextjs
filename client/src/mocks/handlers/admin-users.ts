import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

/** 現在の backend（`PagedUserResponse`・`UserResponse`）の応答の形。#309 で `number`・`hasLoginKey` に変わる */
export const FIXTURE_ADMIN_USER_ROWS = [
  { id: 'u1', loginId: 'taro', name: '山田太郎', role: 'ADMIN', loginKey: 'secret-key', isRequiredPasswordReset: false, totalCredits: 1234 },
  { id: 'u2', loginId: 'hanako', name: '鈴木花子', role: 'USER', loginKey: null, isRequiredPasswordReset: false, totalCredits: 0 },
];

export const adminUsersHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
    HttpResponse.json({
      content: FIXTURE_ADMIN_USER_ROWS,
      totalElements: FIXTURE_ADMIN_USER_ROWS.length,
      totalPages: 1,
      page: 0,
      size: 10,
    })
  ),
  http.post(mockPath(API_PATHS.ADMIN.USERS.LIST), () =>
    HttpResponse.json({
      ...FIXTURE_ADMIN_USER_ROWS[1],
      initialPassword: 'InitPass123',
      passwordExpiredAt: '2026-12-31T00:00:00',
    })
  ),
  http.patch(mockPath(API_PATHS.ADMIN.USERS.DETAIL(':loginId')), () =>
    HttpResponse.json({ ...FIXTURE_ADMIN_USER_ROWS[0], initialPassword: null, passwordExpiredAt: null })
  ),
  http.delete(mockPath(API_PATHS.ADMIN.USERS.DETAIL(':loginId')), () => new HttpResponse(null, { status: 204 })),
];
