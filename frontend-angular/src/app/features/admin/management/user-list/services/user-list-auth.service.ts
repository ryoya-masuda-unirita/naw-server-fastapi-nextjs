import { inject, Injectable } from '@angular/core';
import { STORAGE_KEYS } from '@core/constants';
import { AuthStore } from '@core/stores/auth.store';
import { getUserFromStorage } from '@core/utils/auth.helpers';
import { resolveTenantId } from '@core/utils/tenant.helpers';

/** Auth context restored for admin user list API calls (survives full page reload). */
export interface UserListAuthContext {
  tenantId: string;
  userId: string;
  userRole: string | null;
}

/** Ensures session-backed auth (user + tenant) is ready before user-list HTTP calls. */
@Injectable({ providedIn: 'root' })
export class UserListAuthService {
  private readonly authStore = inject(AuthStore);
  private readyPromise: Promise<boolean> | null = null;

  /** Waits for AuthStore init, then syncs sessionStorage. Returns false when unauthenticated. */
  ensureReady(): Promise<boolean> {
    if (!this.readyPromise) {
      this.readyPromise = this.prepare();
    }
    return this.readyPromise;
  }

  /** Re-read sessionStorage after AuthStore / guard hydration (safe to call before each request). */
  syncSessionFromAuthStore(): void {
    const user = this.authStore.user() ?? getUserFromStorage();
    if (!user) return;

    sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  }

  readContext(): UserListAuthContext | null {
    this.syncSessionFromAuthStore();
    const user = getUserFromStorage();
    if (!user?.id) return null;

    return {
      tenantId: resolveTenantId(),
      userId: user.id,
      userRole: user.role ?? null,
    };
  }

  /** Headers matching a normal authenticated admin request (tenant + session cookie). */
  getRequestHeaders(): Record<string, string> {
    const tenantId = resolveTenantId();
    const headers: Record<string, string> = {};
    if (tenantId) {
      headers['X-Tenant-ID'] = tenantId;
    }
    return headers;
  }

  isAuthenticated(): boolean {
    return !!this.readContext()?.userId;
  }

  private async prepare(): Promise<boolean> {
    await this.authStore.ensureInitialized();
    this.syncSessionFromAuthStore();
    return this.isAuthenticated();
  }
}
