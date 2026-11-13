import { beforeEach, describe, expect, test, vi } from 'vitest';
import { persistTenantId, resolveTenantId } from '@/lib/api-client';
import { useAuthStore } from './auth-store';

// ログイン・ログアウトなど既存の振る舞いは auth-store.test.ts で確認している
describe('useAuthStore のログインキー・セッション破棄', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, isAuthenticated: false });
    persistTenantId('tenant-a');
  });

  describe('loginWithKey', () => {
    test('正しいログインキーならログイン済みになること', async () => {
      const ok = await useAuthStore.getState().loginWithKey('valid-login-key');

      expect(ok).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().userName).toBe('Test User');
      expect(sessionStorage.getItem('AUTH_USER')).not.toBeNull();
      expect(resolveTenantId()).toBe('tenant-a');
    });

    test('誤ったログインキーなら false を返し、未ログインのままであること', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const ok = await useAuthStore.getState().loginWithKey('wrong-key');

      expect(ok).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
    });

    test('ログイン中に誤ったログインキーで失敗しても、ユーザー情報とテナントIDを保つこと', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const user = { id: 'u1', name: 'User', role: 'USER' as const, groups: [] };
      useAuthStore.setState({ user, isAuthenticated: true, userName: 'User' });
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));

      const ok = await useAuthStore.getState().loginWithKey('wrong-key');

      expect(ok).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user).toEqual(user);
      expect(sessionStorage.getItem('AUTH_USER')).not.toBeNull();
      expect(resolveTenantId()).toBe('tenant-a');
    });
  });

  describe('invalidateSession', () => {
    test('ユーザー情報とテナントIDを消して未ログインに戻すこと', () => {
      const user = { id: 'u1', name: 'User', role: 'ADMIN' as const, groups: [] };
      useAuthStore.setState({ user, isAuthenticated: true, isAdmin: true, userName: 'User' });
      sessionStorage.setItem('AUTH_USER', JSON.stringify(user));

      useAuthStore.getState().invalidateSession();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isAdmin).toBe(false);
      expect(state.userName).toBe('Guest');
      expect(sessionStorage.getItem('AUTH_USER')).toBeNull();
      expect(resolveTenantId()).toBe('');
    });
  });
});
