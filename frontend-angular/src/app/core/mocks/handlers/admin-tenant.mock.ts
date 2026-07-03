import { MOCK_API_CONFIGS, MOCK_TENANT_INFO, MOCK_TODAY_USAGE } from '../admin-mock-data';
import type { MockRoute } from '../api-mock';

interface MockTenantApi {
  deleted: boolean;
  tenantId: string;
  tenantName: string;
  isDeleted: boolean;
  resources: { id: string; type: string; description: string }[];
  subscription: {
    id: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: string;
    updatedAt: string;
    plan: {
      id: string;
      name: string;
      maxUsers: number;
      maxCreditsPerMonth: number;
      maxCreditsPerDay: number | null;
      alertPercentage: number | null;
      dailyAlertPercentage: number | null;
    };
  };
}

interface MockEndpoint {
  id: string;
  tenantId: string;
  endpointName: string;
  type: string;
  endpoint: string;
  apiKey: string;
}

const mockTenantApi: MockTenantApi = {
  deleted: false,
  tenantId: 'tenant-001',
  tenantName: 'ワークスペースAA',
  isDeleted: false,
  resources: [
    { id: 'res-001', type: 'STORAGE', description: 'ストレージリソース' },
    { id: 'res-002', type: 'API', description: 'APIリソース' },
  ],
  subscription: {
    id: 'sub-001',
    status: 'ACTIVE',
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-04-01T00:00:00Z',
    plan: {
      id: 'plan-001',
      name: 'ライトプラン(月額 xx円)',
      maxUsers: 80,
      maxCreditsPerMonth: 1_400_000_000,
      maxCreditsPerDay: 500_000,
      alertPercentage: 80,
      dailyAlertPercentage: 80,
    },
  },
};

const mockEndpoints: MockEndpoint[] = [
  {
    id: '1',
    tenantId: 'tenant-dev-001',
    endpointName: 'AZURE_OPENAI_CHAT',
    type: 'AZURE_OPENAI_CHAT',
    endpoint: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: 'xK9mPqL3nRvTsW8dYcHjA5bFuZeG2oNi',
  },
  {
    id: '2',
    tenantId: 'tenant-dev-001',
    endpointName: 'AZURE_OPENAI_EMBEDDING',
    type: 'AZURE_OPENAI_EMBEDDING',
    endpoint: 'https://secuaigent-dev.openai.azure.com/',
    apiKey: 'Bw4tEpV7kJfCmXrD6hQyUa1gOsN3iLzP',
  },
  {
    id: 'ep-local-1',
    tenantId: 'tenant-dev-001',
    endpointName: 'Local Server 1',
    type: 'LOCAL_SERVER',
    endpoint: 'http://localhost:8081',
    apiKey: 'local-key-1',
  },
  {
    id: 'ep-vdb-1',
    tenantId: 'tenant-dev-001',
    endpointName: 'VDB Primary',
    type: 'VDB',
    endpoint: 'https://vdb.example.com',
    apiKey: 'vdb-key-1',
  },
];

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

function getPathOnly(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/** Legacy tenant paths only. Token usage list/history uses `GET /admin/token-usages` (real API). */
export const adminTenantMockRoutes: MockRoute[] = [
  { method: 'GET', match: '/tenant/info', handler: () => [200, structuredClone(MOCK_TENANT_INFO)] },
  { method: 'GET', match: '/tenant/usage/today', handler: () => [200, MOCK_TODAY_USAGE] },
  { method: 'GET', match: '/tenant/api-configs', handler: () => [200, MOCK_API_CONFIGS] },
  {
    method: 'GET',
    match: /^\/admin\/tenants\/endpoints\/[^/]+$/,
    handler: (url) => {
      const type = decodeURIComponent(url.split('/').pop() ?? '');
      const data = mockEndpoints.filter((endpoint) => endpoint.type === type);
      return [200, data];
    },
  },
  {
    method: 'GET',
    match: /\/admin\/tenants\/[^/]+\/endpoints$/,
    handler: (_url, _body, params) => {
      const sortField = params['sortField'] ?? '';
      const sortOrder = params['sortOrder'] ?? 'asc';
      const page = Math.max(1, parseInt(params['page'] ?? '1', 10));
      const pageSize = Math.max(1, parseInt(params['pageSize'] ?? '5', 10));
      const data = [...mockEndpoints];
      if (sortField) {
        data.sort((a, b) => {
          let cmp = 0;
          if (sortField === 'name') cmp = a.endpointName.localeCompare(b.endpointName, 'ja');
          else if (sortField === 'port') cmp = a.type.localeCompare(b.type, 'ja');
          else if (sortField === 'updated') cmp = a.id.localeCompare(b.id);
          return sortOrder === 'desc' ? -cmp : cmp;
        });
      }
      const start = (page - 1) * pageSize;
      return [
        200,
        { data: data.slice(start, start + pageSize), total: data.length, page, pageSize },
      ];
    },
  },
  {
    method: 'DELETE',
    match: /\/admin\/tenants\/[^/]+\/endpoints\/[^/]+$/,
    handler: (url) => {
      const parts = getPathOnly(url).split('/');
      const endpointId = parts[parts.length - 1];
      const idx = mockEndpoints.findIndex((ep) => ep.id === endpointId);
      if (idx === -1) return [400, { message: 'リクエスト不正' }];
      if (mockEndpoints[idx].type !== 'LOCAL_SERVER') {
        return [400, { message: 'LOCAL_SERVERのみ削除可能です' }];
      }
      return [200, { message: 'Delete Endpoint成功' }];
    },
  },
  {
    method: 'PATCH',
    match: /\/admin\/tenants\/[^/]+\/endpoints\/[^/]+$/,
    handler: (url, body) => {
      const b = parseBody(body);
      const type = b['type'] as string | undefined;
      if (!type) return [400, { message: 'リクエスト不正' }];
      const parts = getPathOnly(url).split('/');
      const endpointId = parts[parts.length - 1];
      const tenantId = parts[parts.length - 3];
      const existing = mockEndpoints.find((ep) => ep.id === endpointId);
      if (!existing) return [400, { message: 'リクエスト不正' }];
      if (existing.type !== 'LOCAL_SERVER')
        return [400, { message: 'LOCAL_SERVERのみ更新可能です' }];
      if (type !== 'LOCAL_SERVER') return [400, { message: 'LOCAL_SERVERのみ更新可能です' }];
      const updated = {
        ...existing,
        tenantId,
        type,
        endpointName: (b['endpointName'] as string | undefined) ?? existing.endpointName,
        endpoint: (b['endpoint'] as string | undefined) ?? existing.endpoint,
        apiKey: (b['apiKey'] as string | undefined) ?? existing.apiKey,
      };
      return [200, { message: 'Update Endpoint成功', data: updated }];
    },
  },
  {
    method: 'POST',
    match: /\/admin\/tenants\/[^/]+\/endpoints$/,
    handler: (url, body) => {
      const b = parseBody(body);
      const endpointName = b['endpointName'] as string | undefined;
      const type = b['type'] as string | undefined;
      const apiKey = b['apiKey'] as string | undefined;
      if (!endpointName || !type || !apiKey) return [400, { message: 'リクエスト不正' }];
      if (type !== 'LOCAL_SERVER') return [400, { message: 'LOCAL_SERVERのみ追加可能です' }];
      const parts = getPathOnly(url).split('/');
      const tenantId = parts[parts.length - 2];
      const slug = endpointName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const endpoint = `https://${slug}.openai.azure.com/`;
      const newEndpoint = {
        id: `ep-${Date.now()}`,
        tenantId,
        endpointName,
        type,
        endpoint,
        apiKey,
      };
      return [200, { message: 'Create Endpoint成功', data: newEndpoint }];
    },
  },
  {
    method: 'PATCH',
    match: new RegExp(`^/admin/tenants/[^/]+$`),
    handler: (_url, body) => {
      const b = parseBody(body);
      const tenantName = b['tenantName'] as string | undefined;
      if (!tenantName) return [400, { message: 'リクエスト不正' }];
      return [200, { message: 'Update Tenant Info成功' }];
    },
  },
  {
    method: 'PATCH',
    match: new RegExp(`^/admin/tenants/[^/]+/usage-limit$`),
    handler: (_url, body) => {
      const b = parseBody(body);
      const maxCreditsPerMonth = b['maxCreditsPerMonth'] as number | undefined;
      const maxCreditsPerDay = b['maxCreditsPerDay'] as number | null | undefined;
      const maxUsers = b['maxUsers'] as number | null | undefined;
      const alertPercentage = b['alertPercentage'] as number | null | undefined;
      const dailyAlertPercentage = b['dailyAlertPercentage'] as number | null | undefined;
      mockTenantApi.subscription.plan.maxCreditsPerMonth =
        maxCreditsPerMonth ?? mockTenantApi.subscription.plan.maxCreditsPerMonth;
      mockTenantApi.subscription.plan.maxCreditsPerDay =
        maxCreditsPerDay ?? mockTenantApi.subscription.plan.maxCreditsPerDay;
      mockTenantApi.subscription.plan.maxUsers =
        maxUsers ?? mockTenantApi.subscription.plan.maxUsers;
      mockTenantApi.subscription.plan.alertPercentage =
        alertPercentage ?? mockTenantApi.subscription.plan.alertPercentage;
      mockTenantApi.subscription.plan.dailyAlertPercentage =
        dailyAlertPercentage ?? mockTenantApi.subscription.plan.dailyAlertPercentage;
      return [200, { message: 'Usage limit updated successfully' }];
    },
  },
];
