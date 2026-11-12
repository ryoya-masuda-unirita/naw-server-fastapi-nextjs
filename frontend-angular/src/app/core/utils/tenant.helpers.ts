import { STORAGE_KEYS } from '@core/constants';

export function resolveTenantId(): string {
  return sessionStorage.getItem(STORAGE_KEYS.TENANT_ID) ?? '';
}

export function persistTenantId(tenantId: string): void {
  sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
}
