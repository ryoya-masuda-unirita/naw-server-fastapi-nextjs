/**
 * `resolveTenantId` / `persistTenantId` の単体テスト。
 *
 * サブドメイン廃止後は sessionStorage の TENANT_ID のみを参照する。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '@core/constants';
import { persistTenantId, resolveTenantId } from '@core/utils/tenant.helpers';

describe('resolveTenantId（テナント ID 解決）', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('セッションにテナントIDが保存されているとき、その値を返すこと', () => {
    sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, 'stored-tenant');

    const result = resolveTenantId();

    expect(result).toBe('stored-tenant');
  });

  it('セッションにテナントIDが保存されていないとき、空文字を返すこと', () => {
    const result = resolveTenantId();

    expect(result).toBe('');
  });
});

describe('persistTenantId（テナント ID 永続化）', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('渡されたテナントIDをセッションに保存すること', () => {
    persistTenantId('new-tenant');

    expect(sessionStorage.getItem(STORAGE_KEYS.TENANT_ID)).toBe('new-tenant');
  });
});
