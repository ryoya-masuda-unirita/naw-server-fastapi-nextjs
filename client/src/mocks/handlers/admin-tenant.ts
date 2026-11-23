import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

/** 現在の backend（`TenantDetailResponse`）の応答の形。プランの上限・アラートは `maxCreditsPerMonth` だけ返る */
export const FIXTURE_TENANT_DETAIL = {
  tenantId: 'tenant-1',
  tenantName: 'テストテナント',
  maxUsageBasedCreditsPerMonth: 0,
  isDeleted: false,
  resources: [],
  subscription: {
    id: 'sub-1',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    plan: { id: 'plan-1', name: 'ライトプラン', maxUsers: 10, maxCreditsPerMonth: 10000 },
  },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

/** `GET /api/credit-usage/workspace` の応答（請求期間は 11/02〜12/01） */
export const FIXTURE_WORKSPACE_USAGE = {
  totalCredits: 16,
  creditLimit: 10000,
  periodFrom: '2026-11-02T00:00:00Z',
  periodTo: '2026-12-02T00:00:00Z',
  nextBillingResetAt: '2026-12-02T00:00:00Z',
};

/** `EndpointResponse`（`apiKey` は返らない） */
export const FIXTURE_ENDPOINTS = [
  { id: 'ep1', tenantId: 'tenant-1', type: 'LOCAL_SERVER', endpointName: '社内Waha', endpoint: 'https://waha.example.com' },
  { id: 'ep2', tenantId: 'tenant-1', type: 'AZURE_OPENAI_CHAT', endpointName: 'Azure Chat', endpoint: 'https://azure.example.com' },
];

export const FIXTURE_TOKEN_USAGES = {
  contents: [
    {
      id: 'tu1',
      userId: 'u1',
      messageId: 'm1',
      model: 'gpt',
      inputTokens: 1,
      outputTokens: 2,
      embeddingTokens: 0,
      totalTokens: 3,
      inputCredits: 100,
      outputCredits: 1134,
      embeddingCredits: 0,
      totalCredits: 1234,
      createdAt: '2026-11-10T03:04:00Z',
    },
  ],
  totalCount: 1,
  hasNext: false,
};

export const adminTenantHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.TENANTS.GET), () => HttpResponse.json(FIXTURE_TENANT_DETAIL)),
  http.patch(mockPath(API_PATHS.ADMIN.TENANTS.UPDATE(':tenantId')), () => HttpResponse.json(FIXTURE_TENANT_DETAIL)),
  http.get(mockPath(API_PATHS.CREDIT_USAGE.WORKSPACE), () => HttpResponse.json(FIXTURE_WORKSPACE_USAGE)),
  http.get(mockPath(API_PATHS.ADMIN_TOKEN_USAGES.SUMMARY), () =>
    HttpResponse.json({
      inputTokens: 10,
      outputTokens: 20,
      embeddingTokens: 0,
      totalTokens: 30,
      inputCredits: 1,
      outputCredits: 2,
      embeddingCredits: 0,
      totalCredits: 16,
    }),
  ),
  http.get(mockPath(API_PATHS.ADMIN_TOKEN_USAGES.LIST), () => HttpResponse.json(FIXTURE_TOKEN_USAGES)),
  http.get(mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINTS(':tenantId')), () => HttpResponse.json(FIXTURE_ENDPOINTS)),
  http.post(mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINTS(':tenantId')), () => HttpResponse.json(FIXTURE_ENDPOINTS[0])),
  http.patch(mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINT(':tenantId', ':endpointId')), () =>
    HttpResponse.json(FIXTURE_ENDPOINTS[0]),
  ),
  http.delete(
    mockPath(API_PATHS.ADMIN.TENANTS.ENDPOINT(':tenantId', ':endpointId')),
    () => new HttpResponse(null, { status: 204 }),
  ),
];
