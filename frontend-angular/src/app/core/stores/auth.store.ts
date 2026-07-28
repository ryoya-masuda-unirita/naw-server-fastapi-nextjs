import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { STORAGE_KEYS } from '@core/constants';
import { persistTenantId, resolveTenantId } from '@core/utils/tenant.helpers';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import {
  AuthSessionResponse,
  BackendAuthResponse,
  LoginRequest,
  LoginStatus,
  LoginSuccessResponse,
  User,
} from '@features/auth/types';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthApiService);

  private readonly _user = signal<User | null>(null);
  private _initPromise: Promise<void> | null = null;

  readonly user = this._user.asReadonly();

  readonly isAuthenticated = computed(() => !!this._user());
  readonly isAdmin = computed(() => this._user()?.role === 'ADMIN');
  readonly isGroupAdmin = computed(
    () => this._user()?.groups?.some((group) => group.groupAdmin) ?? false,
  );
  readonly isGroupAdminOnly = computed(() => !this.isAdmin() && this.isGroupAdmin());
  readonly canAccessAdminConsole = computed(() => this.isAdmin() || this.isGroupAdmin());
  readonly adminGroupIds = computed(
    () =>
      this._user()
        ?.groups?.filter((group) => group.groupAdmin)
        .map((group) => group.groupId) ?? [],
  );
  readonly userName = computed(() => this._user()?.name ?? 'Guest');

  async ensureInitialized(): Promise<void> {
    if (!this._initPromise) {
      this._initPromise = this.initializeSession();
    }
    return this._initPromise;
  }

  private async initializeSession(): Promise<void> {
    this.restoreFromStorage();
    const previousGroups = this._user()?.groups ?? [];
    const result = await this.authService.getSession();
    if (result) {
      const user = this.mapToUser(result);
      if ((!user.groups || user.groups.length === 0) && previousGroups.length > 0) {
        user.groups = previousGroups;
      }
      this._user.set(user);
      this.saveUserToStorage(user);
    } else {
      this._user.set(null);
      this.clearStorage();
    }
  }

  async login(credentials: LoginRequest): Promise<LoginStatus> {
    // ログインリクエスト自体にも X-Tenant-ID ヘッダが必要なため、
    // authInterceptor が参照できるよう API 呼び出し前にセッションへ保存する。
    persistTenantId(credentials.tenantId);
    const response = await this.authService.loginMutation.mutateAsync(credentials);

    if (response.loginStatus === 'REQUIRES_PASSWORD_RESET') {
      // パスワードリセット必須ユーザーは有効なセッションを持たないため、
      // サーバーへの logout 通信は行わずローカル状態のクリアのみ行う。
      // （logout が 401 を返すと errorInterceptor がフルページ遷移してしまい、
      //   pw-reset 遷移と競合してブラウザの「戻る」が壊れるため）
      this._user.set(null);
      this.clearStorage();
      await this.router.navigate([ROUTES.AUTH.PW_RESET], {
        state: {
          username: response.id,
          oldPassword: credentials.password,
          reason: response.reason,
        },
      });
      return 'REQUIRES_PASSWORD_RESET';
    }

    this.handleAuthSuccess(response);
    return 'SUCCESS';
  }

  /**
   * loginkey によるログイン。App Initializer から router 初期ナビゲーション前に呼ばれるため、
   * ここでは画面遷移は行わずユーザーの確立のみを行う（着地は router に委ねる）。
   */
  async loginWithKey(loginKey: string): Promise<boolean> {
    try {
      const res = await this.authService.loginWithKey(loginKey);
      const user = this.mapToUser(res);
      this._user.set(user);
      this.saveToStorage(user, resolveTenantId());
      return true;
    } catch (e) {
      console.error('Login-key authentication failed', e);
      this._user.set(null);
      this.clearStorage();
      return false;
    }
  }

  async completePasswordReset(response: AuthSessionResponse): Promise<void> {
    this.handleAuthSuccess(response);
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
    } catch (e) {
      console.error('Logout service error', e);
      return;
    }
    this._user.set(null);
    this._initPromise = null;
    this.clearStorage();
    this.router.navigate([ROUTES.AUTH.LOGIN]);
  }

  private handleAuthSuccess(response: LoginSuccessResponse | AuthSessionResponse): void {
    const user = this.mapToUser(response);
    this._user.set(user);
    this.saveToStorage(user, resolveTenantId());
    this.router.navigate([ROUTES.APP.DASHBOARD]);
  }

  private mapToUser(
    response: LoginSuccessResponse | AuthSessionResponse | BackendAuthResponse,
  ): User {
    return {
      id: response.id,
      name: response.name,
      role: response.role as 'USER' | 'ADMIN',
      groups: 'groups' in response ? (response.groups ?? []) : [],
    };
  }

  private restoreFromStorage(): void {
    const userJson = sessionStorage.getItem(STORAGE_KEYS.USER);
    if (userJson) {
      try {
        this._user.set(JSON.parse(userJson) as User);
      } catch {
        // ignore
      }
    }
  }

  private saveToStorage(user: User, tenantId: string): void {
    sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
  }

  private saveUserToStorage(user: User): void {
    sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  private clearStorage(): void {
    sessionStorage.removeItem(STORAGE_KEYS.USER);
    sessionStorage.removeItem(STORAGE_KEYS.TENANT_ID);
  }
}
