import { TestBed } from '@angular/core/testing';
import { provideTanStackQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientService } from '@core/services/api-client';
import { ToastService } from '@core/services/toast.service';
import { TranslateService } from '@ngx-translate/core';
import { API_PATHS } from '@core/constants/api-paths.config';
import type { Endpoint, EndpointCreatePayload, TenantInfo } from '@app-types/admin/tenant.types';
import type {
  TokenUsageListResponse,
  TokenUsageSummaryResponse,
} from '@app-types/token-usage.type';
import { TenantApiService } from './tenant-api.service';

function buildApiClientMock() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    put: vi.fn(),
  };
}

function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function buildTenantInfo(overrides: Partial<TenantInfo> = {}): TenantInfo {
  return {
    deleted: false,
    tenantId: 'tenant-1',
    tenantName: 'Test Tenant',
    isDeleted: false,
    resources: [],
    subscription: {
      id: 'sub-1',
      status: 'ACTIVE',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2027-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      plan: {
        id: 'plan-1',
        name: 'Standard',
        maxUsers: 10,
        maxCreditsPerMonth: 1000,
        maxCreditsPerDay: 100,
        alertPercentage: 80,
        dailyAlertPercentage: 80,
      },
    },
    ...overrides,
  };
}

function buildEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 'endpoint-1',
    tenantId: 'tenant-1',
    endpointName: 'Local Server',
    type: 'LOCAL_SERVER',
    endpoint: 'http://localhost:9090/',
    apiKey: 'secret-key',
    ...overrides,
  };
}

function buildEndpointPayload(): EndpointCreatePayload {
  return {
    endpointName: 'Local Server',
    type: 'LOCAL_SERVER',
    endpoint: 'http://localhost:9090/',
    apiKey: 'secret-key',
  };
}

function buildTokenUsageSummary(): TokenUsageSummaryResponse {
  return {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    inputCredits: 1,
    outputCredits: 2,
    totalCredits: 3,
  };
}

function buildTokenUsageList(): TokenUsageListResponse {
  return {
    contents: [
      {
        id: 'usage-1',
        userId: 'user-1',
        messageId: null,
        model: 'gpt-4',
        inputTokens: 1,
        outputTokens: 2,
        embeddingTokens: 0,
        totalTokens: 3,
        inputCredits: 1,
        outputCredits: 2,
        embeddingCredits: 0,
        totalCredits: 3,
        createdAt: '2026-05-20T12:00:00.000Z',
      },
    ],
    totalCount: 1,
    hasNext: false,
  };
}

describe('TenantApiService', () => {
  let service: TenantApiService;
  let api: ReturnType<typeof buildApiClientMock>;
  let queryClient: QueryClient;
  let toastSuccess: ReturnType<typeof vi.fn>;
  let invalidateQueriesSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api = buildApiClientMock();
    toastSuccess = vi.fn();
    queryClient = testQueryClient();
    invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideTanStackQuery(queryClient),
        TenantApiService,
        { provide: ApiClientService, useValue: api },
        { provide: ToastService, useValue: { success: toastSuccess, error: vi.fn() } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    });

    service = TestBed.inject(TenantApiService);
    queryClient.setQueryData(['tenant', 'info'], buildTenantInfo());
  });

  describe('テナント情報を取得する', () => {
    it('キャッシュ済みテナント情報から tenantId を参照できる', () => {
      expect(service.tenantId()).toBe('tenant-1');
      expect(service.tenantInfoQuery.data()?.tenantName).toBe('Test Tenant');
    });

    it('テナント情報取得 API を呼び出す', async () => {
      queryClient.clear();
      api.get.mockResolvedValue(buildTenantInfo({ tenantId: 'tenant-fetched' }));

      await service.tenantInfoQuery.refetch();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ADMIN.TENANTS.GET);
    });
  });

  describe('テナント名を更新する', () => {
    it('テナント名を更新してキャッシュを再取得する', async () => {
      api.patch.mockResolvedValue({});

      await service.updateTenant('Renamed Tenant');

      expect(api.patch).toHaveBeenCalledWith(
        API_PATHS.ADMIN.TENANTS.UPDATE('tenant-1'),
        { tenantName: 'Renamed Tenant' },
        { skipGlobalErrorToast: true },
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['tenant', 'info'] });
      expect(toastSuccess).toHaveBeenCalledWith('TENANT.UPDATE_TENANT_SUCCESS');
      expect(service.isUpdatingTenant()).toBe(false);
    });

    it('tenantId が未取得のときは API を呼ばない', async () => {
      queryClient.clear();
      api.patch.mockClear();

      await service.updateTenant('Renamed Tenant');

      expect(api.patch).not.toHaveBeenCalled();
      expect(toastSuccess).not.toHaveBeenCalled();
    });
  });

  describe('利用上限を更新する', () => {
    it('利用上限を更新してテナント情報のキャッシュを再取得する', async () => {
      const payload = {
        maxCreditsPerMonth: 2000,
        maxCreditsPerDay: 200,
        maxUsers: 20,
        alertPercentage: 90,
        dailyAlertPercentage: 85,
      };
      api.patch.mockResolvedValue({});

      await service.updateUsageLimit(payload);

      expect(api.patch).toHaveBeenCalledWith(
        API_PATHS.ADMIN.TENANTS.UPDATE_USAGE_LIMIT('tenant-1'),
        payload,
        { skipGlobalErrorToast: true },
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['tenant', 'info'] });
      expect(toastSuccess).toHaveBeenCalledWith('TENANT.UPDATE_USAGE_LIMIT_SUCCESS');
      expect(service.isUpdatingUsageLimit()).toBe(false);
    });
  });

  describe('エンドポイントを管理する', () => {
    const payload = buildEndpointPayload();

    it('エンドポイントを作成して一覧キャッシュを再取得する', async () => {
      api.post.mockResolvedValue(buildEndpoint());

      await service.createEndpoint(payload);

      expect(api.post).toHaveBeenCalledWith(
        API_PATHS.ADMIN.TENANTS.ENDPOINTS('tenant-1'),
        payload,
        { skipGlobalErrorToast: true },
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['tenant', 'endpoints'] });
      expect(toastSuccess).toHaveBeenCalledWith('TENANT.CREATE_ENDPOINT_SUCCESS');
      expect(service.isCreatingEndpoint()).toBe(false);
    });

    it('エンドポイントを更新して一覧キャッシュを再取得する', async () => {
      api.patch.mockResolvedValue(buildEndpoint({ endpointName: 'Updated Chat API' }));

      await service.updateEndpoint('endpoint-1', payload);

      expect(api.patch).toHaveBeenCalledWith(
        API_PATHS.ADMIN.TENANTS.ENDPOINT('tenant-1', 'endpoint-1'),
        payload,
        { skipGlobalErrorToast: true },
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['tenant', 'endpoints'] });
      expect(toastSuccess).toHaveBeenCalledWith('TENANT.UPDATE_ENDPOINT_SUCCESS');
      expect(service.isUpdatingEndpoint()).toBe(false);
    });

    it('エンドポイントを削除して一覧キャッシュを再取得する', async () => {
      api.delete.mockResolvedValue(undefined);

      await service.deleteEndpoint('endpoint-1');

      expect(api.delete).toHaveBeenCalledWith(
        API_PATHS.ADMIN.TENANTS.ENDPOINT('tenant-1', 'endpoint-1'),
        { skipGlobalErrorToast: true },
      );
      expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['tenant', 'endpoints'] });
      expect(toastSuccess).toHaveBeenCalledWith('TENANT.DELETE_ENDPOINT_SUCCESS');
      expect(service.isDeletingEndpoint()).toBe(false);
    });

    it('tenantId が未取得のときはエンドポイント作成 API を呼ばない', async () => {
      queryClient.clear();
      api.post.mockClear();

      await service.createEndpoint(payload);

      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('トークン利用サマリーを取得する', () => {
    it('期間タイプに応じたサマリー API を呼び出す', async () => {
      service.tokenUsageSummaryType.set('today');
      api.get.mockResolvedValue(buildTokenUsageSummary());

      await service.tokenUsageSummaryQuery.refetch();

      expect(api.get).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${API_PATHS.ADMIN_TOKEN_USAGES.SUMMARY}\\?`)),
      );
    });
  });

  describe('トークン利用履歴一覧を取得する', () => {
    it('ページ・ソート条件を API パラメータに変換して一覧を取得する', async () => {
      service.usagePage.set(2);
      service.usageSortField.set('amount');
      service.usageSortOrder.set('asc');
      service.usageUserFilter.set('user-1');
      api.get.mockResolvedValue(buildTokenUsageList());

      await service.tokenUsageListQuery.refetch();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ADMIN_TOKEN_USAGES.LIST, {
        params: expect.objectContaining({
          page: 1,
          size: TenantApiService.USAGE_HISTORY_PAGE_SIZE,
          orderBy: 'totalTokens',
          reverse: false,
          userId: 'user-1',
        }),
      });
    });
  });

  describe('エンドポイント一覧を取得する', () => {
    it('テナントのエンドポイント一覧をページング付きで取得する', async () => {
      service.endpointsPage.set(1);
      service.endpointsSortField.set('name');
      service.endpointsSortOrder.set('asc');
      api.get.mockResolvedValue({
        contents: [buildEndpoint()],
        totalCount: 1,
        hasNext: false,
      });

      await service.endpointsQuery.refetch();

      expect(api.get).toHaveBeenCalledWith(API_PATHS.ADMIN.TENANTS.ENDPOINTS('tenant-1'), {
        params: expect.objectContaining({
          page: 0,
          size: TenantApiService.ENDPOINTS_PAGE_SIZE,
          orderBy: 'endpointName',
          reverse: false,
        }),
      });
    });

    it('tenantId が未取得のときはエンドポイント一覧クエリが無効になる', () => {
      queryClient.clear();

      expect(service.tenantId()).toBeUndefined();
      expect(service.endpointsQuery.isEnabled()).toBe(false);
    });
  });
});
