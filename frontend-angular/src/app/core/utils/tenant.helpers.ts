import { STORAGE_KEYS } from '@core/constants';

export function resolveTenantId(): string {
  const stored = sessionStorage.getItem(STORAGE_KEYS.TENANT_ID) ?? '';
  if (stored) return stored;
  const parts = window.location.hostname.split('.');
  return parts.length > 1 ? parts[0] : '';
}
