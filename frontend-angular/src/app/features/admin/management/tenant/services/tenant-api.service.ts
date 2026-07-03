import { computed, inject, Injectable, signal } from '@angular/core';
import { injectQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { TranslateService } from '@ngx-translate/core';
import { ApiClientService } from '@core/services/api-client';
import { ToastService } from '@core/services/toast.service';
import { API_PATHS } from '@core/constants/api-paths.config';
import { buildTokenUsageDateRange } from '@core/utils/api-datetime.util';
import type {
  EndpointCreatePayload,
  EndpointListResponse,
  TenantInfo,
} from '@app-types/admin/tenant.types';
import type {
  TokenUsageListResponse,
  TokenUsageSummaryResponse,
} from '@app-types/token-usage.type';
import {
  buildEndpointListParams,
  buildTokenUsageListParams,
  mapEndpoint,
  mapEndpointList,
  mapTenantInfo,
  mapTokenUsageList,
  mapTokenUsageSummary,
} from './tenant-api.mappers';
import { isManageableEndpointType } from '../tenant.constants';

@Injectable({ providedIn: 'root' })
export class TenantApiService {
  private readonly api = inject(ApiClientService);
  private readonly queryClient = inject(QueryClient);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly isUpdatingTenant = signal<boolean>(false);
  readonly isUpdatingUsageLimit = signal<boolean>(false);
  readonly isCreatingEndpoint = signal<boolean>(false);
  readonly isUpdatingEndpoint = signal<boolean>(false);
  readonly isDeletingEndpoint = signal<boolean>(false);

  readonly tenantId = computed(() => this.tenantInfoQuery.data()?.tenantId);

  readonly tenantInfoQuery = injectQuery(() => ({
    queryKey: ['tenant', 'info'],
    queryFn: async (): Promise<TenantInfo> => {
      const body = await this.api.get<unknown>(API_PATHS.ADMIN.TENANTS.GET);
      return mapTenantInfo(body);
    },
  }));

  readonly tokenUsageSummaryType = signal<'today' | 'month'>('month');

  readonly tokenUsageSummaryQuery = injectQuery(() => {
    const type = this.tokenUsageSummaryType();
    const { from, to } = buildTokenUsageDateRange(type);
    const params = new URLSearchParams({
      from,
      to,
    });
    return {
      queryKey: ['admin', 'token-usages', 'summary', type, from, to],
      queryFn: async (): Promise<TokenUsageSummaryResponse> => {
        const body = await this.api.get<unknown>(
          `${API_PATHS.ADMIN_TOKEN_USAGES.SUMMARY}?${params.toString()}`,
        );
        return mapTokenUsageSummary(body);
      },
    };
  });

  static readonly USAGE_HISTORY_PAGE_SIZE = 5;

  readonly usageSortField = signal<string | null>(null);
  readonly usageSortOrder = signal<string | null>(null);
  readonly usagePage = signal<number>(1);
  readonly usageUserFilter = signal<string>('');

  readonly tokenUsageListQuery = injectQuery(() => {
    const sortField = this.usageSortField();
    const sortOrder = this.usageSortOrder();
    const page = this.usagePage();
    const userId = this.usageUserFilter();
    const pageSize = TenantApiService.USAGE_HISTORY_PAGE_SIZE;
    const { from, to } = buildTokenUsageDateRange('month');
    const queryParams = buildTokenUsageListParams({
      from,
      to,
      userId,
      page,
      size: pageSize,
      sortField,
      sortOrder,
    });
    return {
      queryKey: ['admin', 'token-usages', 'list', from, to, sortField, sortOrder, page, userId],
      queryFn: async (): Promise<TokenUsageListResponse> => {
        const body = await this.api.get<unknown>(API_PATHS.ADMIN_TOKEN_USAGES.LIST, {
          params: queryParams,
        });
        return mapTokenUsageList(body);
      },
    };
  });

  static readonly ENDPOINTS_PAGE_SIZE = 5;

  readonly endpointsSortField = signal<string | null>(null);
  readonly endpointsSortOrder = signal<string | null>(null);
  readonly endpointsPage = signal<number>(1);

  readonly endpointsQuery = injectQuery(() => {
    const tenantId = this.tenantId();
    const sortField = this.endpointsSortField();
    const sortOrder = this.endpointsSortOrder();
    const page = this.endpointsPage();
    const pageSize = TenantApiService.ENDPOINTS_PAGE_SIZE;
    const queryParams = buildEndpointListParams({
      page,
      size: pageSize,
      sortField,
      sortOrder,
    });
    return {
      queryKey: ['tenant', 'endpoints', tenantId, sortField, sortOrder, page],
      queryFn: async (): Promise<EndpointListResponse> => {
        const body = await this.api.get<unknown>(API_PATHS.ADMIN.TENANTS.ENDPOINTS(tenantId!), {
          params: queryParams,
        });
        return mapEndpointList(body, page, pageSize);
      },
      enabled: !!tenantId,
    };
  });

  async createEndpoint(payload: EndpointCreatePayload): Promise<void> {
    const tenantId = this.tenantId();
    if (!tenantId) return;
    if (!isManageableEndpointType(payload.type)) {
      this.toast.error(this.translate.instant('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }

    this.isCreatingEndpoint.set(true);
    try {
      const body = await this.api.post<unknown>(
        API_PATHS.ADMIN.TENANTS.ENDPOINTS(tenantId),
        payload,
        { skipGlobalErrorToast: true },
      );
      mapEndpoint(body);
      await this.invalidateEndpoints();
      this.toast.success(this.translate.instant('TENANT.CREATE_ENDPOINT_SUCCESS'));
    } catch (err) {
      this.toast.error(this.translate.instant('TENANT.CREATE_ENDPOINT_FAILED'));
      throw err;
    } finally {
      this.isCreatingEndpoint.set(false);
    }
  }

  async updateEndpoint(endpointId: string, payload: EndpointCreatePayload): Promise<void> {
    const tenantId = this.tenantId();
    if (!tenantId) return;
    if (!isManageableEndpointType(payload.type)) {
      this.toast.error(this.translate.instant('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }

    this.isUpdatingEndpoint.set(true);
    try {
      const body = await this.api.patch<unknown>(
        API_PATHS.ADMIN.TENANTS.ENDPOINT(tenantId, endpointId),
        payload,
        { skipGlobalErrorToast: true },
      );
      mapEndpoint(body);
      await this.invalidateEndpoints();
      this.toast.success(this.translate.instant('TENANT.UPDATE_ENDPOINT_SUCCESS'));
    } catch (err) {
      this.toast.error(this.translate.instant('TENANT.UPDATE_ENDPOINT_FAILED'));
      throw err;
    } finally {
      this.isUpdatingEndpoint.set(false);
    }
  }

  async deleteEndpoint(endpointId: string): Promise<void> {
    const tenantId = this.tenantId();
    if (!tenantId) return;

    const endpoint = this.endpointsQuery.data()?.data.find((item) => item.id === endpointId);
    if (endpoint && !isManageableEndpointType(endpoint.type)) {
      this.toast.error(this.translate.instant('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }

    this.isDeletingEndpoint.set(true);
    try {
      await this.api.delete<unknown>(API_PATHS.ADMIN.TENANTS.ENDPOINT(tenantId, endpointId), {
        skipGlobalErrorToast: true,
      });
      await this.invalidateEndpoints();
      this.toast.success(this.translate.instant('TENANT.DELETE_ENDPOINT_SUCCESS'));
    } catch (err) {
      this.toast.error(this.translate.instant('TENANT.DELETE_ENDPOINT_FAILED'));
      throw err;
    } finally {
      this.isDeletingEndpoint.set(false);
    }
  }

  async updateTenant(tenantName: string): Promise<void> {
    const tenantId = this.tenantId();
    if (!tenantId) return;

    this.isUpdatingTenant.set(true);
    try {
      await this.api.patch<unknown>(
        API_PATHS.ADMIN.TENANTS.UPDATE(tenantId),
        { tenantName },
        {
          skipGlobalErrorToast: true,
        },
      );
      await this.queryClient.invalidateQueries({ queryKey: ['tenant', 'info'] });
      this.toast.success(this.translate.instant('TENANT.UPDATE_TENANT_SUCCESS'));
    } catch (err) {
      this.toast.error(this.translate.instant('TENANT.UPDATE_TENANT_FAILED'));
      throw err;
    } finally {
      this.isUpdatingTenant.set(false);
    }
  }

  async updateUsageLimit(payload: {
    maxCreditsPerMonth?: number;
    maxCreditsPerDay?: number;
    maxUsers?: number;
    alertPercentage?: number;
    dailyAlertPercentage?: number;
  }): Promise<void> {
    const tenantId = this.tenantId();
    if (!tenantId) return;

    this.isUpdatingUsageLimit.set(true);
    try {
      await this.api.patch<unknown>(API_PATHS.ADMIN.TENANTS.UPDATE_USAGE_LIMIT(tenantId), payload, {
        skipGlobalErrorToast: true,
      });
      await this.queryClient.invalidateQueries({ queryKey: ['tenant', 'info'] });
      this.toast.success(this.translate.instant('TENANT.UPDATE_USAGE_LIMIT_SUCCESS'));
    } catch (err) {
      this.toast.error(this.translate.instant('TENANT.UPDATE_USAGE_LIMIT_FAILED'));
      throw err;
    } finally {
      this.isUpdatingUsageLimit.set(false);
    }
  }

  private async invalidateEndpoints(): Promise<void> {
    await this.queryClient.invalidateQueries({ queryKey: ['tenant', 'endpoints'] });
  }
}
