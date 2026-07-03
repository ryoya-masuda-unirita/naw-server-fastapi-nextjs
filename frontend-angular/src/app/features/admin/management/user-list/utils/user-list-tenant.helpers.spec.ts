import { STORAGE_KEYS } from '@core/constants';
import {
  extractTenantIdFromHostname,
  isValidUserListTenantId,
  repairUserListTenantIdInStorage,
  resolveUserListTenantId,
} from './user-list-tenant.helpers';

describe('user-list-tenant.helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('isValidUserListTenantId', () => {
    it('rejects empty and literal undefined/null', () => {
      expect(isValidUserListTenantId('')).toBe(false);
      expect(isValidUserListTenantId('undefined')).toBe(false);
      expect(isValidUserListTenantId('UNDEFINED')).toBe(false);
      expect(isValidUserListTenantId('null')).toBe(false);
    });

    it('accepts real tenant ids', () => {
      expect(isValidUserListTenantId('test-tenant')).toBe(true);
    });
  });

  describe('extractTenantIdFromHostname', () => {
    it('extracts subdomain from test-tenant.localhost', () => {
      expect(extractTenantIdFromHostname('test-tenant.localhost')).toBe('test-tenant');
    });

    it('returns empty for bare localhost', () => {
      expect(extractTenantIdFromHostname('localhost')).toBe('');
    });
  });

  describe('repairUserListTenantIdInStorage', () => {
    it('overwrites string undefined with subdomain tenant', () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'undefined');
      const repaired = repairUserListTenantIdInStorage();
      expect(repaired).toBe(extractTenantIdFromHostname(window.location.hostname) || '');
      if (repaired) {
        expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe(repaired);
      }
    });

    it('keeps valid stored tenant', () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'my-tenant');
      expect(repairUserListTenantIdInStorage()).toBe('my-tenant');
    });
  });

  describe('resolveUserListTenantId', () => {
    it('prefers valid sessionStorage over hostname', () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'stored-tenant');
      expect(resolveUserListTenantId()).toBe('stored-tenant');
    });

    it('falls back to hostname when storage is invalid', () => {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'undefined');
      const expected = extractTenantIdFromHostname(window.location.hostname);
      expect(resolveUserListTenantId()).toBe(expected);
    });
  });
});
