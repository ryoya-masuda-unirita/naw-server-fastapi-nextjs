import { describe, expect, test } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from './utils';

describe('mockPath', () => {
  test('ベースURLに関係なく一致するよう先頭をワイルドカードにすること', () => {
    expect(mockPath(API_PATHS.ROOMS.DETAIL(':roomId'))).toBe('*/api/rooms/:roomId');
  });

  test('値を encode するパスでもパスパラメータとして一致すること', async () => {
    let loginId = '';
    server.use(
      http.delete(mockPath(API_PATHS.ADMIN.USERS.DETAIL(':loginId')), ({ params }) => {
        loginId = String(params.loginId);
        return new HttpResponse(null, { status: 204 });
      })
    );

    await apiClient.delete(API_PATHS.ADMIN.USERS.DETAIL('user@example.com'));

    expect(loginId).toBe('user@example.com');
  });
});
