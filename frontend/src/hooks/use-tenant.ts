import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToastStore } from '@/components/shared/toast-store';
import {
  isManageableEndpointType,
  USAGE_FILTER_USER_LIMIT,
  USAGE_HISTORY_PAGE_SIZE,
} from '@/components/features/admin/tenant/tenant.constants';
import {
  buildTokenUsageListParams,
  mapEndpoint,
  mapEndpointList,
  mapTenantInfo,
  mapTokenUsageList,
  mapTokenUsageSummary,
} from '@/components/features/admin/tenant/tenant-api-mappers';
import { normalizeAdminUsersListBody } from '@/components/features/admin/users/admin-users-api-normalize';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { formatApiDateTimeUtc } from '@/lib/utils/api-datetime';
import { getBillingPeriodEndFromResetAt, type CreditUsageResponse } from '@/types/credit-usage.type';
import type { Endpoint, EndpointCreatePayload, TenantInfo } from '@/types/admin/tenant.types';
import type {
  TokenUsageListResponse,
  TokenUsageSummaryResponse,
} from '@/types/token-usage.type';
import type { UserApiItem } from '@/types/admin/user.types';

// 移植元 tenant/services/tenant-api.service.ts。クエリは hooks、更新は「移植元と同じ流れ・同じトーストの関数」を返す hook にする

const TENANT_INFO_KEY = ['tenant', 'info'] as const;
const ENDPOINTS_KEY = ['tenant', 'endpoints'] as const;
const USER_FILTER_STALE_TIME_MS = 5 * 60 * 1000;

/** 更新系の失敗は画面でトーストを出すので、共通のエラートーストは出さない */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

/** 移植元 tenantInfoQuery。画面を開いたときだけ読み込む（フォーカスで読み直すと画面全体がスピナーに替わるため） */
export function useTenantInfo() {
  return useQuery<TenantInfo>({
    queryKey: TENANT_INFO_KEY,
    refetchOnWindowFocus: false,
    queryFn: async () => mapTenantInfo(await apiClient.get<unknown>(API_PATHS.ADMIN.TENANTS.GET)),
  });
}

/**
 * 請求サイクルの起算日（前回のリセット日）と終了日。カレンダー月ではなく契約の請求期間に基づく
 * （移植元 workspaceUsageQuery・billingPeriodFrom・billingPeriodTo）
 */
export function useBillingPeriod() {
  const { data } = useQuery({
    queryKey: ['tenant', 'credit-usage', 'workspace'],
    refetchOnWindowFocus: false,
    queryFn: () => apiClient.get<CreditUsageResponse>(API_PATHS.CREDIT_USAGE.WORKSPACE),
  });
  return {
    from: data?.periodFrom,
    to: getBillingPeriodEndFromResetAt(data?.nextBillingResetAt),
  };
}

/** 請求期間内の利用サマリー（移植元 tokenUsageSummaryQuery の今月区分）。起算日が分かるまで取得しない */
export function useBillingTokenUsageSummary(from: string | undefined) {
  return useQuery<TokenUsageSummaryResponse>({
    queryKey: ['admin', 'token-usages', 'summary', 'month', from],
    enabled: !!from,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const body = await apiClient.get<unknown>(API_PATHS.ADMIN_TOKEN_USAGES.SUMMARY, {
        params: { from: from ?? '', to: formatApiDateTimeUtc(new Date()) },
      });
      return mapTokenUsageSummary(body);
    },
  });
}

export interface TokenUsageListOptions {
  from: string | undefined;
  sortField: string | null;
  sortOrder: string | null;
  page: number;
  userId: string;
}

/** 請求期間内の利用履歴（移植元 tokenUsageListQuery）。`to` は取得のたびの現在時刻 */
export function useTokenUsageList({ from, sortField, sortOrder, page, userId }: TokenUsageListOptions) {
  return useQuery<TokenUsageListResponse>({
    queryKey: ['admin', 'token-usages', 'list', from, sortField, sortOrder, page, userId],
    enabled: !!from,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const params = buildTokenUsageListParams({
        from: from ?? '',
        to: formatApiDateTimeUtc(new Date()),
        userId,
        page,
        size: USAGE_HISTORY_PAGE_SIZE,
        sortField,
        sortOrder,
      });
      return mapTokenUsageList(
        await apiClient.get<unknown>(API_PATHS.ADMIN_TOKEN_USAGES.LIST, { params }),
      );
    },
  });
}

/** 利用者の絞り込みに使うユーザー（移植元 usage-tab の usersQuery。名前の昇順で 500 件まで） */
export function useUsageFilterUsers() {
  return useQuery<UserApiItem[]>({
    queryKey: ['admin', 'users', 'tenant-usage-filter'],
    staleTime: USER_FILTER_STALE_TIME_MS,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const filter = {
        pageSize: USAGE_FILTER_USER_LIMIT,
        pageIndex: 1,
        sortField: 'name',
        sortOrder: 'asc',
      } as const;
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
        params: {
          page: 0,
          size: filter.pageSize,
          searchText: '',
          role: '',
          sort: `${filter.sortField},${filter.sortOrder}`,
          includeUsage: true,
        },
      });
      return normalizeAdminUsersListBody(raw, filter).data;
    },
  });
}

/** 移植元 endpointsQuery。テナント ID が分かるまで取得しない */
export function useEndpoints(tenantId: string | undefined) {
  return useQuery<Endpoint[]>({
    queryKey: [...ENDPOINTS_KEY, tenantId],
    enabled: !!tenantId,
    refetchOnWindowFocus: false,
    queryFn: async () =>
      mapEndpointList(await apiClient.get<unknown>(API_PATHS.ADMIN.TENANTS.ENDPOINTS(tenantId ?? ''))),
  });
}

/**
 * エンドポイントの作成。移植元どおり、テナント ID が無いとき・LOCAL_SERVER 以外のときは API を呼ばずに戻る（後者はトースト）。
 * API の失敗はトーストを出して例外を投げ直す。
 */
export function useCreateEndpoint() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenantInfo();
  const mutation = useMutation({
    mutationFn: async (payload: EndpointCreatePayload) => {
      const body = await apiClient.post<unknown>(
        API_PATHS.ADMIN.TENANTS.ENDPOINTS(tenant?.tenantId ?? ''),
        payload,
        OWN_ERROR_TOAST,
      );
      mapEndpoint(body);
      await queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
    },
  });
  const createEndpoint = async (payload: EndpointCreatePayload): Promise<void> => {
    if (!tenant?.tenantId) return;
    const toast = useToastStore.getState();
    if (!isManageableEndpointType(payload.type)) {
      toast.error(t('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }
    try {
      await mutation.mutateAsync(payload);
      toast.success(t('TENANT.CREATE_ENDPOINT_SUCCESS'));
    } catch (error) {
      toast.error(t('TENANT.CREATE_ENDPOINT_FAILED'));
      throw error;
    }
  };
  return { createEndpoint, isPending: mutation.isPending };
}

/** エンドポイントの更新。流れは {@link useCreateEndpoint} と同じ */
export function useUpdateEndpoint() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenantInfo();
  const mutation = useMutation({
    mutationFn: async ({ endpointId, payload }: { endpointId: string; payload: EndpointCreatePayload }) => {
      const body = await apiClient.patch<unknown>(
        API_PATHS.ADMIN.TENANTS.ENDPOINT(tenant?.tenantId ?? '', endpointId),
        payload,
        OWN_ERROR_TOAST,
      );
      mapEndpoint(body);
      await queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
    },
  });
  const updateEndpoint = async (endpointId: string, payload: EndpointCreatePayload): Promise<void> => {
    if (!tenant?.tenantId) return;
    const toast = useToastStore.getState();
    if (!isManageableEndpointType(payload.type)) {
      toast.error(t('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }
    try {
      await mutation.mutateAsync({ endpointId, payload });
      toast.success(t('TENANT.UPDATE_ENDPOINT_SUCCESS'));
    } catch (error) {
      toast.error(t('TENANT.UPDATE_ENDPOINT_FAILED'));
      throw error;
    }
  };
  return { updateEndpoint, isPending: mutation.isPending };
}

/** エンドポイントの削除。一覧にあって LOCAL_SERVER でないものは API を呼ばずトーストだけ出す */
export function useDeleteEndpoint() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenantInfo();
  const { data: endpoints } = useEndpoints(tenant?.tenantId);
  const mutation = useMutation({
    mutationFn: async (endpointId: string) => {
      await apiClient.delete<unknown>(
        API_PATHS.ADMIN.TENANTS.ENDPOINT(tenant?.tenantId ?? '', endpointId),
        OWN_ERROR_TOAST,
      );
      await queryClient.invalidateQueries({ queryKey: ENDPOINTS_KEY });
    },
  });
  const deleteEndpoint = async (endpointId: string): Promise<void> => {
    if (!tenant?.tenantId) return;
    const toast = useToastStore.getState();
    const endpoint = endpoints?.find((item) => item.id === endpointId);
    if (endpoint && !isManageableEndpointType(endpoint.type)) {
      toast.error(t('TENANT.ENDPOINT_TYPE_NOT_MANAGEABLE'));
      return;
    }
    try {
      await mutation.mutateAsync(endpointId);
      toast.success(t('TENANT.DELETE_ENDPOINT_SUCCESS'));
    } catch (error) {
      toast.error(t('TENANT.DELETE_ENDPOINT_FAILED'));
      throw error;
    }
  };
  return { deleteEndpoint, isPending: mutation.isPending };
}

/** ワークスペース名の更新。成功したらテナント情報を取り直す */
export function useUpdateTenant() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenantInfo();
  const mutation = useMutation({
    mutationFn: async (tenantName: string) => {
      await apiClient.patch<unknown>(
        API_PATHS.ADMIN.TENANTS.UPDATE(tenant?.tenantId ?? ''),
        { tenantName },
        OWN_ERROR_TOAST,
      );
      await queryClient.invalidateQueries({ queryKey: TENANT_INFO_KEY });
    },
  });
  const updateTenant = async (tenantName: string): Promise<void> => {
    if (!tenant?.tenantId) return;
    const toast = useToastStore.getState();
    try {
      await mutation.mutateAsync(tenantName);
      toast.success(t('TENANT.UPDATE_TENANT_SUCCESS'));
    } catch (error) {
      toast.error(t('TENANT.UPDATE_TENANT_FAILED'));
      throw error;
    }
  };
  return { updateTenant, isPending: mutation.isPending };
}

/** 移植元 updateUsageLimit の本文 */
export interface UsageLimitPayload {
  maxCreditsPerMonth?: number;
  maxCreditsPerDay?: number;
  maxUsers?: number;
  alertPercentage?: number;
  dailyAlertPercentage?: number;
}

/**
 * 利用上限の更新。`PATCH .../usage-limit` は移植元 server にも backend にも無く（#281）、
 * 移植元の本番と同じく失敗のトーストになる
 */
export function useUpdateUsageLimit() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: tenant } = useTenantInfo();
  const mutation = useMutation({
    mutationFn: async (payload: UsageLimitPayload) => {
      await apiClient.patch<unknown>(
        API_PATHS.ADMIN.TENANTS.UPDATE_USAGE_LIMIT(tenant?.tenantId ?? ''),
        payload,
        OWN_ERROR_TOAST,
      );
      await queryClient.invalidateQueries({ queryKey: TENANT_INFO_KEY });
    },
  });
  const updateUsageLimit = async (payload: UsageLimitPayload): Promise<void> => {
    if (!tenant?.tenantId) return;
    const toast = useToastStore.getState();
    try {
      await mutation.mutateAsync(payload);
      toast.success(t('TENANT.UPDATE_USAGE_LIMIT_SUCCESS'));
    } catch (error) {
      toast.error(t('TENANT.UPDATE_USAGE_LIMIT_FAILED'));
      throw error;
    }
  };
  return { updateUsageLimit, isPending: mutation.isPending };
}
