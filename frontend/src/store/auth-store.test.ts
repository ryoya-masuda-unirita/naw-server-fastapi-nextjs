import { describe, test, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { persistTenantId } from '@/lib/api-client';
import type { User } from '@/types/auth';
import { deriveAuthState, useAuthStore } from './auth-store';

const BASE_URL = import.meta.env.VITE_API_URL;
const FIXTURE_TENANT_ID = 'tenant-1';

beforeEach(() => {
  // store をリセット
  useAuthStore.setState({ user: null });
  // initPromise はクロージャ内なので logout でリセットできる
});

describe('useAuthStore', () => {
  describe('初期状態', () => {
    test('user が null であること', () => {
      expect(useAuthStore.getState().user).toBe(null);
    });

    test('isAuthenticated が false であること', () => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    test('userName が Guest であること', () => {
      expect(useAuthStore.getState().userName).toBe('Guest');
    });

    test('isAdmin が false であること', () => {
      expect(useAuthStore.getState().isAdmin).toBe(false);
    });
  });

  describe('login', () => {
    test('ログイン成功時に user がセットされること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().user?.id).toBe('user1');
      expect(useAuthStore.getState().user?.name).toBe('Test User');
    });

    test('ログイン成功時に isAuthenticated が true になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    test('ADMIN ログイン時に isAdmin が true になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'admin', password: 'pass' });
      });

      expect(useAuthStore.getState().isAdmin).toBe(true);
    });

    test('ログイン成功時に sessionStorage に user が保存されること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      const stored = sessionStorage.getItem('AUTH_USER');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!).id).toBe('user1');
    });

    test('ログイン失敗時にエラーがスローされること', async () => {
      await expect(
        useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'invalid', password: 'wrong' })
      ).rejects.toThrow();
    });
  });

  describe('テナントID', () => {
    test('ログインリクエストに入力したテナントIDが X-Tenant-ID ヘッダで送られること', async () => {
      let tenantHeader: string | null = null;
      let body: Record<string, unknown> = {};
      server.use(
        http.post(`${BASE_URL}/auth/login`, async ({ request }) => {
          tenantHeader = request.headers.get('X-Tenant-ID');
          body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            loginStatus: 'SUCCESS',
            id: 'user1',
            name: 'Test User',
            role: 'USER',
            token: 'mock-token',
            groups: [],
          });
        })
      );

      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      expect(tenantHeader).toBe(FIXTURE_TENANT_ID);
      // backend のログイン API はボディにテナントIDを持たないため送らない
      expect(body).toEqual({ username: 'user', password: 'pass' });
    });

    test('ログイン成功後もテナントIDが保存されていること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      expect(sessionStorage.getItem('TENANT_ID')).toBe(FIXTURE_TENANT_ID);
    });

    test('ログイン失敗時にテナントIDが削除されること', async () => {
      await expect(
        useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'invalid', password: 'wrong' })
      ).rejects.toThrow();

      expect(sessionStorage.getItem('TENANT_ID')).toBeNull();
    });

    test('パスワードリセットが必要な場合はテナントIDを保持すること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'reset_user', password: 'pass' });
      });

      expect(sessionStorage.getItem('TENANT_ID')).toBe(FIXTURE_TENANT_ID);
      expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
    });

    test('セッション確認リクエストに保存済みのテナントIDが X-Tenant-ID ヘッダで送られること', async () => {
      // initPromise はストアのクロージャ内に残るため、logout でリセットしてから確認する
      await act(async () => {
        await useAuthStore.getState().logout();
      });
      let tenantHeader: string | null = null;
      server.use(
        http.get(`${BASE_URL}/api/auth`, ({ request }) => {
          tenantHeader = request.headers.get('X-Tenant-ID');
          return HttpResponse.json({
            id: 'user1',
            name: 'Test User',
            role: 'USER',
          });
        })
      );
      persistTenantId(FIXTURE_TENANT_ID);

      await act(async () => {
        await useAuthStore.getState().ensureInitialized();
      });

      expect(tenantHeader).toBe(FIXTURE_TENANT_ID);
      expect(useAuthStore.getState().user?.id).toBe('user1');
      // GET /api/auth は tenant_id を返さないため、保存済みのテナントIDが上書きされないこと
      expect(sessionStorage.getItem('TENANT_ID')).toBe(FIXTURE_TENANT_ID);
    });
  });

  describe('logout', () => {
    test('ログアウト後に user が null になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });
      expect(useAuthStore.getState().user).not.toBeNull();

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().user).toBeNull();
    });

    test('ログアウト後に sessionStorage がクリアされること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
        await useAuthStore.getState().logout();
      });

      expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
      expect(sessionStorage.getItem('TENANT_ID')).toBeNull();
    });
  });

  describe('completePasswordReset', () => {
    test('user がセットされること', async () => {
      await act(async () => {
        await useAuthStore.getState().completePasswordReset({
          id: 'reset_user',
          name: 'Reset User',
          role: 'USER',
          token: 'new-token',
          groups: [],
        });
      });

      expect(useAuthStore.getState().user?.id).toBe('reset_user');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  describe('computed 値', () => {
    test('userName が user.name を返すこと', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ tenantId: FIXTURE_TENANT_ID, username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().userName).toBe('Test User');
    });
  });
  describe('権限の派生値', () => {
    const FIXTURE_GROUP_ADMIN: User = {
      id: 'u2',
      name: 'グループ管理者',
      role: 'USER',
      groups: [
        { groupId: 'g1', groupAdmin: true },
        { groupId: 'g2', groupAdmin: false },
        { groupId: 'g3', groupAdmin: true },
      ],
    };

    test('グループ管理者は管理コンソールに入れ、管理グループIDを持つこと', () => {
      const state = deriveAuthState(FIXTURE_GROUP_ADMIN);

      expect(state.isAdmin).toBe(false);
      expect(state.isGroupAdmin).toBe(true);
      expect(state.isGroupAdminOnly).toBe(true);
      expect(state.canAccessAdminConsole).toBe(true);
      expect(state.adminGroupIds).toEqual(['g1', 'g3']);
    });

    test('テナント管理者はグループ管理者でなくても管理コンソールに入れること', () => {
      const state = deriveAuthState({ id: 'a', name: 'admin', role: 'ADMIN', groups: [] });

      expect(state.isGroupAdmin).toBe(false);
      expect(state.isGroupAdminOnly).toBe(false);
      expect(state.canAccessAdminConsole).toBe(true);
    });

    test('一般ユーザーは管理コンソールに入れないこと', () => {
      const state = deriveAuthState({
        id: 'u',
        name: 'user',
        role: 'USER',
        groups: [{ groupId: 'g1', groupAdmin: false }],
      });

      expect(state.canAccessAdminConsole).toBe(false);
      expect(state.adminGroupIds).toEqual([]);
    });

    test('セッション確認がグループを返さないとき、保存済みのグループを引き継ぐこと', async () => {
      await act(async () => {
        await useAuthStore.getState().logout();
      });
      sessionStorage.setItem('AUTH_USER', JSON.stringify(FIXTURE_GROUP_ADMIN));
      server.use(
        http.get(`${BASE_URL}/api/auth`, () =>
          HttpResponse.json({ id: 'u2', name: 'グループ管理者', role: 'USER' })
        )
      );

      await act(async () => {
        await useAuthStore.getState().ensureInitialized();
      });

      expect(useAuthStore.getState().user?.groups).toEqual(FIXTURE_GROUP_ADMIN.groups);
      expect(useAuthStore.getState().adminGroupIds).toEqual(['g1', 'g3']);
      expect(useAuthStore.getState().canAccessAdminConsole).toBe(true);
    });
  });
});
