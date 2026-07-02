import { describe, test, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useAuthStore } from './auth-store';

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
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().user?.id).toBe('user1');
      expect(useAuthStore.getState().user?.name).toBe('Test User');
    });

    test('ログイン成功時に isAuthenticated が true になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    test('ADMIN ログイン時に isAdmin が true になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ username: 'admin', password: 'pass' });
      });

      expect(useAuthStore.getState().isAdmin).toBe(true);
    });

    test('ログイン成功時に sessionStorage に user が保存されること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
      });

      const stored = sessionStorage.getItem('AUTH_USER');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!).id).toBe('user1');
    });

    test('ログイン失敗時にエラーがスローされること', async () => {
      await expect(
        useAuthStore.getState().login({ username: 'invalid', password: 'wrong' })
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    test('ログアウト後に user が null になること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
      });
      expect(useAuthStore.getState().user).not.toBeNull();

      await act(async () => {
        await useAuthStore.getState().logout();
      });

      expect(useAuthStore.getState().user).toBeNull();
    });

    test('ログアウト後に sessionStorage がクリアされること', async () => {
      await act(async () => {
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
        await useAuthStore.getState().logout();
      });

      expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
      expect(sessionStorage.getItem('TENANT_ID')).toBeNull();
    });
  });

  describe('completePasswordReset', () => {
    test('user がセットされること', () => {
      act(() => {
        useAuthStore.getState().completePasswordReset({
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
        await useAuthStore.getState().login({ username: 'user', password: 'pass' });
      });

      expect(useAuthStore.getState().userName).toBe('Test User');
    });
  });
});
