import { STORAGE_KEYS } from '@core/constants';

const INVALID_TENANT_LITERALS = new Set(['undefined', 'null']);

/** True when value is a usable tenant id (not empty / literal "undefined"). */
export function isValidUserListTenantId(value: string | null | undefined): boolean {
  if (value == null) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !INVALID_TENANT_LITERALS.has(trimmed.toLowerCase());
}

/**
 * Extract tenant id from subdomain.
 * e.g. `test-tenant.localhost` → `test-tenant`
 */
export function extractTenantIdFromHostname(hostname: string = window.location.hostname): string {
  if (!hostname) return '';
  const host = hostname.trim().toLowerCase();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return '';
  }

  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) return '';

  const subdomain = parts[0];
  if (subdomain === 'www' && parts.length > 2) {
    return parts[1];
  }
  if (subdomain === 'www') {
    return '';
  }

  return subdomain;
}

/** Resolve tenant id for user-list: sessionStorage first, then subdomain fallback. */
export function resolveUserListTenantId(): string {
  const stored = sessionStorage.getItem(STORAGE_KEYS.TENANT_ID);
  if (isValidUserListTenantId(stored)) {
    return stored!.trim();
  }

  const fromHost = extractTenantIdFromHostname();
  if (isValidUserListTenantId(fromHost)) {
    return fromHost.trim();
  }

  return '';
}

/** Overwrite invalid/missing sessionStorage tenantId with a repaired value. */
export function persistUserListTenantId(tenantId: string): void {
  if (!isValidUserListTenantId(tenantId)) return;
  sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId.trim());
}

/**
 * Repair sessionStorage when common auth wrote `undefined` or left tenant empty.
 * Returns the tenant id that was persisted (or '').
 */
export function repairUserListTenantIdInStorage(): string {
  const stored = sessionStorage.getItem(STORAGE_KEYS.TENANT_ID);
  if (isValidUserListTenantId(stored)) {
    return stored!.trim();
  }

  const resolved = resolveUserListTenantId();
  if (isValidUserListTenantId(resolved)) {
    persistUserListTenantId(resolved);
    return resolved;
  }

  return '';
}
