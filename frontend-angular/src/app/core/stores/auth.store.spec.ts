/**
 * NAW-965 / NAW-1051: `AuthStore` の単体テスト。
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEYS } from '@core/constants';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '@core/stores/auth.store';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import type {
  AuthSessionResponse,
  BackendAuthResponse,
  LoginRequest,
  LoginSuccessResponse,
  User,
} from '@features/auth/types';

const FIXTURE_BACKEND_AUTH: BackendAuthResponse = {
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  tenant_id: 'tenant-from-api',
};

const FIXTURE_USER_FROM_BACKEND: User = {
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  groups: [],
};

const FIXTURE_LOGIN_RESPONSE: LoginSuccessResponse = {
  loginStatus: 'SUCCESS',
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  token: 'token',
  groups: [{ groupId: 'group-1', groupAdmin: false }],
};

const FIXTURE_AUTH_SESSION: AuthSessionResponse = {
  id: 'user-1',
  name: 'Alice',
  role: 'USER',
  token: 'token-after-reset',
  groups: [{ groupId: 'group-1', groupAdmin: false }],
};

const FIXTURE_CREDENTIALS: LoginRequest = { username: 'alice', password: 'secret' };

describe('AuthStore（認証ストア）', () => {
  let store: AuthStore;
  let getSession: ReturnType<typeof vi.fn>;
  let logout: ReturnType<typeof vi.fn>;
  let mutateAsync: ReturnType<typeof vi.fn>;
  let loginWithKey: ReturnType<typeof vi.fn>;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.resetTestingModule();
    sessionStorage.clear();
    getSession = vi.fn();
    logout = vi.fn().mockResolvedValue(undefined);
    mutateAsync = vi.fn();
    loginWithKey = vi.fn();
    navigate = vi.fn().mockResolvedValue(true);

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        {
          provide: AuthApiService,
          useValue: {
            getSession,
            logout,
            loginMutation: { mutateAsync },
            loginWithKey,
          },
        },
        { provide: Router, useValue: { navigate } },
      ],
    });

    store = TestBed.inject(AuthStore);
  });

  describe('ensureInitialized メソッド', () => {
    it('保護画面に入る前のセッション確認でログイン中なら、sessionStorageにユーザー情報を保存する', async () => {
      getSession.mockResolvedValue(FIXTURE_BACKEND_AUTH);

      await store.ensureInitialized();

      expect(store.user()).toEqual(FIXTURE_USER_FROM_BACKEND);
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.USER) ?? 'null')).toEqual(
        FIXTURE_USER_FROM_BACKEND,
      );
    });

    it('セッション確認は何度呼んでも、サーバーへの問い合わせは1回だけ', async () => {
      getSession.mockResolvedValue(FIXTURE_BACKEND_AUTH);

      await store.ensureInitialized();
      await store.ensureInitialized();

      expect(getSession).toHaveBeenCalledTimes(1);
    });

    it('未ログインと分かったら、sessionStorageからuserIdとtenantIdを消す', async () => {
      sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(FIXTURE_USER_FROM_BACKEND));
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'old');
      getSession.mockResolvedValue(null);

      await store.ensureInitialized();

      expect(store.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
    });
  });

  describe('login メソッド', () => {
    it('ログイン成功後、ユーザー情報を保存してダッシュボードへ進む', async () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'tenant-spy');
      mutateAsync.mockResolvedValue(FIXTURE_LOGIN_RESPONSE);

      const status = await store.login(FIXTURE_CREDENTIALS);

      const expectedUser: User = {
        id: 'user-1',
        name: 'Alice',
        role: 'USER',
        groups: FIXTURE_LOGIN_RESPONSE.groups,
      };
      expect(status).toBe('SUCCESS');
      expect(store.user()).toEqual(expectedUser);
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('tenant-spy');
      expect(navigate).toHaveBeenCalledWith([ROUTES.APP.DASHBOARD]);
    });

    it('REQUIRES_PASSWORD_RESET のとき、storageを保存せずパスワード再設定画面へ進む', async () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'tenant-spy');
      mutateAsync.mockResolvedValue({
        loginStatus: 'REQUIRES_PASSWORD_RESET',
        id: 'alice',
        name: 'Alice',
        role: 'USER',
        reason: 'INITIAL',
      });

      const status = await store.login(FIXTURE_CREDENTIALS);

      expect(status).toBe('REQUIRES_PASSWORD_RESET');
      expect(store.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
      // 401 によるフルページ遷移と pw-reset 遷移の競合を避けるため logout 通信は行わない
      expect(logout).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith([ROUTES.AUTH.PW_RESET], {
        state: {
          username: 'alice',
          oldPassword: 'secret',
          reason: 'INITIAL',
        },
      });
    });

    it('ログインに失敗したとき、sessionStorageにuserIdとtenantIdを保存せずダッシュボードへ進まない', async () => {
      mutateAsync.mockRejectedValue(new Error('invalid credentials'));

      await expect(store.login(FIXTURE_CREDENTIALS)).rejects.toThrow('invalid credentials');
      expect(store.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('loginWithKey メソッド', () => {
    it('loginKey 認証成功時、ユーザー情報を保存して true を返す（画面遷移はしない）', async () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'tenant-spy');
      loginWithKey.mockResolvedValue(FIXTURE_LOGIN_RESPONSE);

      const ok = await store.loginWithKey('key-123');

      const expectedUser: User = {
        id: 'user-1',
        name: 'Alice',
        role: 'USER',
        groups: FIXTURE_LOGIN_RESPONSE.groups,
      };
      expect(ok).toBe(true);
      expect(loginWithKey).toHaveBeenCalledWith('key-123');
      expect(store.user()).toEqual(expectedUser);
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.USER) ?? 'null')).toEqual(expectedUser);
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('tenant-spy');
      // App Initializer から呼ばれるため、ここでは router 遷移しない
      expect(navigate).not.toHaveBeenCalled();
    });

    it('loginKey 認証失敗時、storageを消して false を返す（ログイン画面フォールバック）', async () => {
      sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(FIXTURE_USER_FROM_BACKEND));
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'old');
      loginWithKey.mockRejectedValue(new Error('invalid login key'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      const ok = await store.loginWithKey('bad-key');

      expect(ok).toBe(false);
      expect(store.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('completePasswordReset メソッド', () => {
    it('パスワード再設定成功後、ユーザー情報を保存してダッシュボードへ進む', async () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'tenant-spy');

      await store.completePasswordReset(FIXTURE_AUTH_SESSION);

      const expectedUser: User = {
        id: 'user-1',
        name: 'Alice',
        role: 'USER',
        groups: FIXTURE_AUTH_SESSION.groups,
      };
      expect(store.user()).toEqual(expectedUser);
      expect(navigate).toHaveBeenCalledWith([ROUTES.APP.DASHBOARD]);
    });
  });

  describe('logout メソッド', () => {
    it('ログアウト成功時、sessionStorageからuserIdとtenantIdを消してログイン画面へ進む', async () => {
      getSession.mockResolvedValue(FIXTURE_BACKEND_AUTH);
      await store.ensureInitialized();
      logout.mockResolvedValue(undefined);

      await store.logout();

      expect(logout).toHaveBeenCalledTimes(1);
      expect(store.user()).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.USER)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBeNull();
      expect(navigate).toHaveBeenCalledWith([ROUTES.AUTH.LOGIN]);
    });

    it('ログアウトAPIが失敗したとき、sessionStorageのuserIdとtenantIdを維持し画面遷移しない', async () => {
      getSession.mockResolvedValue(FIXTURE_BACKEND_AUTH);
      await store.ensureInitialized();
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'tenant-spy');
      const userBefore = store.user();
      logout.mockRejectedValue(new Error('network'));
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      await store.logout();

      expect(logout).toHaveBeenCalledTimes(1);
      expect(store.user()).toEqual(userBefore);
      expect(JSON.parse(sessionStorage.getItem(STORAGE_KEYS.USER) ?? 'null')).toEqual(
        FIXTURE_USER_FROM_BACKEND,
      );
      expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('tenant-spy');
      expect(navigate).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
