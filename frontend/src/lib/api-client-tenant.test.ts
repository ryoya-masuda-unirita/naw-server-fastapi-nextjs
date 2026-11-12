import { describe, test, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { apiClient, clearTenantId, persistTenantId, resolveTenantId } from './api-client';

// api-client.test.ts は #223 が URL 組み立てのテストで使うため、テナント関連はファイルを分ける
const BASE_URL = import.meta.env.VITE_API_URL;
const FIXTURE_TENANT_ID = 'tenant-a';

const captureTenantHeader = (method: 'get' | 'post', path: string) => {
  const captured: { tenantId: string | null | undefined } = { tenantId: undefined };
  server.use(
    http[method](`${BASE_URL}${path}`, ({ request }) => {
      captured.tenantId = request.headers.get('X-Tenant-ID');
      return HttpResponse.json({});
    })
  );
  return captured;
};

describe('apiClient のテナントID', () => {
  describe('X-Tenant-ID ヘッダ', () => {
    test('保存したテナントIDが GET リクエストの X-Tenant-ID ヘッダに付くこと', async () => {
      const captured = captureTenantHeader('get', '/api/auth');
      persistTenantId(FIXTURE_TENANT_ID);

      await apiClient.get('/api/auth');

      expect(captured.tenantId).toBe(FIXTURE_TENANT_ID);
    });

    test('保存したテナントIDが POST リクエストの X-Tenant-ID ヘッダに付くこと', async () => {
      const captured = captureTenantHeader('post', '/auth/login');
      persistTenantId(FIXTURE_TENANT_ID);

      await apiClient.post('/auth/login', { username: 'user', password: 'pass' });

      expect(captured.tenantId).toBe(FIXTURE_TENANT_ID);
    });

    test('テナントIDが未保存なら X-Tenant-ID ヘッダを付けないこと', async () => {
      const captured = captureTenantHeader('get', '/api/auth');

      await apiClient.get('/api/auth');

      expect(captured.tenantId).toBeNull();
    });
  });

  describe('保存・削除', () => {
    test('保存したテナントIDを読み出せ、削除後は空になること', () => {
      persistTenantId(FIXTURE_TENANT_ID);
      expect(resolveTenantId()).toBe(FIXTURE_TENANT_ID);

      clearTenantId();
      expect(resolveTenantId()).toBe('');
    });
  });
});
