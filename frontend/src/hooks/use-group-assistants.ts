import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  mapGroupAssistantItem,
  parseSpringPage,
} from '@/components/features/admin/groups/group-api-mappers';
import type { ComboboxOption } from '@/components/shared/form-combobox';
import { apiClient, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { AssistantApiItem } from '@/types/admin/assistant.types';
import type {
  GroupAssistantItem,
  GroupAssistantListFilter,
} from '@/types/admin/group-management.types';
import type { PagedResponse } from '@/types/api-response.type';
import { invalidateGroupLists } from './use-group-detail';

// 移植元 group-list の GroupAssistantsApiService と GroupAssistantsStore（API 呼び出し部分）。

/** 所属アシスタント一覧の key の先頭 */
export const GROUP_ASSISTANTS_QUERY_KEY = 'admin-group-assistants';

/** 追加ダイアログの候補の件数（移植元 `loadAddAssistantOptions` の pageSize） */
const ADD_OPTIONS_PAGE_SIZE = 50;

/** 追加・削除の失敗は画面でトーストを出すので、共通のエラートーストは出さない */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

/** 表示の「—」（値がないとき。移植元と同じ） */
const EMPTY_LABEL = '—';

function toTenantListParams(filter: GroupAssistantListFilter): QueryParams {
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    search: filter.search?.trim() || undefined,
    type: filter.type || undefined,
    categoryId: filter.categoryId || undefined,
    excludeGroupId: filter.excludeGroupId,
    sort: filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined,
  };
}

/** 接続サーバーの表示名。移植元 `GroupAssistantsStore.serverLabel` は日本語を直書きしている */
function serverLabel(type: string): string {
  switch (type) {
    case 'SECURE':
      return 'ローカル';
    case 'SAAS_RAG':
      return 'クラウド(学習先指定)';
    case 'SAAS_CHAT':
      return 'クラウド(一般)';
    default:
      return type || EMPTY_LABEL;
  }
}

function formatEndpointLabel(endpoints: AssistantApiItem['endpoints']): string {
  const endpoint = endpoints?.[0];
  if (!endpoint) return EMPTY_LABEL;
  return endpoint.label || endpoint.model || endpoint.type || EMPTY_LABEL;
}

/** 移植元 `GroupAssistantsStore.toViewModel`。表に出す文言を付け足す */
export function toGroupAssistantItem(item: AssistantApiItem): GroupAssistantItem {
  return {
    ...item,
    name: item.name ?? item.id,
    historyLabel: item.includeHistory ? 'ON' : 'OFF',
    serverLabel: serverLabel(item.type),
    endpointLabel: formatEndpointLabel(item.endpoints),
  };
}

/** 一覧と件数 */
export interface GroupAssistantsPage {
  items: GroupAssistantItem[];
  totalElements: number;
}

/**
 * 所属アシスタント一覧（移植元 `GroupAssistantsStore.load`）。
 * 読み込みに失敗したときは data が undefined になり、画面は空の一覧にする。
 *
 * @param groupId グループ ID
 * @param filter 検索・絞り込み・並べ替え・ページ
 */
export function useGroupAssistants(groupId: string, filter: GroupAssistantListFilter) {
  return useQuery({
    queryKey: [GROUP_ASSISTANTS_QUERY_KEY, groupId, filter],
    enabled: groupId !== '',
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<GroupAssistantsPage> => {
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.GROUPS.ASSISTANTS(groupId), {
        params: toTenantListParams(filter),
      });
      const page: PagedResponse<AssistantApiItem> = parseSpringPage(raw, mapGroupAssistantItem);
      return { items: page.content.map(toGroupAssistantItem), totalElements: page.totalElements };
    },
  });
}

/**
 * 追加ダイアログの候補（移植元 `loadAddAssistantOptions`）。このグループにまだ入っていないアシスタントを取る。
 * 失敗したときは候補なしにする。
 *
 * @param groupId グループ ID
 */
export async function fetchAddAssistantOptions(groupId: string): Promise<ComboboxOption[]> {
  try {
    const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.ASSISTANTS.LIST, {
      params: toTenantListParams({
        pageSize: ADD_OPTIONS_PAGE_SIZE,
        pageIndex: 1,
        search: '',
        excludeGroupId: groupId,
      }),
    });
    return parseSpringPage(raw, mapGroupAssistantItem).content.map(
      ({ id, name, description, category }) => ({
        value: id,
        label: name,
        description,
        tag: category?.name,
      }),
    );
  } catch {
    return [];
  }
}

/** 変更のあとに一覧を読み直す。`mutateAsync` で読み直しの完了まで待てるよう Promise を返す */
function useReloadAssistants(groupId: string) {
  const queryClient = useQueryClient();
  return async () => {
    invalidateGroupLists(queryClient);
    await queryClient.invalidateQueries({ queryKey: [GROUP_ASSISTANTS_QUERY_KEY, groupId] });
  };
}

/**
 * アシスタントの追加（移植元 `GroupAssistantsStore.addAssistants`）
 *
 * @param groupId グループ ID
 */
export function useAddGroupAssistants(groupId: string) {
  const reload = useReloadAssistants(groupId);
  return useMutation({
    mutationFn: async (assistantIds: string[]): Promise<void> => {
      await apiClient.post<void>(
        API_PATHS.ADMIN.GROUPS.ASSISTANTS(groupId),
        { assistantIds },
        OWN_ERROR_TOAST,
      );
    },
    onSuccess: reload,
  });
}

/**
 * アシスタントの削除（移植元 `GroupAssistantsStore.removeAssistants`）。
 * 1 件でも失敗したら全体を失敗として扱い、読み直しはしない（移植元の `Promise.all` と同じ）。
 *
 * @param groupId グループ ID
 */
export function useRemoveGroupAssistants(groupId: string) {
  const reload = useReloadAssistants(groupId);
  return useMutation({
    mutationFn: async (assistantIds: string[]): Promise<void> => {
      await Promise.all(
        assistantIds.map((id) =>
          apiClient.delete<void>(
            API_PATHS.ADMIN.GROUPS.ASSISTANT_DETAIL(groupId, id),
            OWN_ERROR_TOAST,
          ),
        ),
      );
    },
    onSuccess: reload,
  });
}
