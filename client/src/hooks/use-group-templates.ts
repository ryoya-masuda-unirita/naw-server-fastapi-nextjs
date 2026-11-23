import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  mapGroupTemplateItem,
  parseSpringPage,
} from '@/components/features/admin/groups/group-api-mappers';
import type { ComboboxOption } from '@/components/shared/form-combobox';
import { apiClient, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { GroupTemplateListFilter } from '@/types/admin/group-management.types';
import type { TemplateApiItem } from '@/types/admin/template.types';
import { invalidateGroupLists } from './use-group-detail';

// 移植元 group-list の GroupTemplatesApiService と GroupTemplatesStore（API 呼び出し部分）。

/** 所属テンプレート一覧の key の先頭 */
export const GROUP_TEMPLATES_QUERY_KEY = 'admin-group-templates';

/** 追加ダイアログの候補の件数（移植元 `loadAddTemplateOptions` の pageSize） */
const ADD_OPTIONS_PAGE_SIZE = 50;

/** 追加・削除の失敗は画面でトーストを出すので、共通のエラートーストは出さない */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

function toTenantListParams(filter: GroupTemplateListFilter): QueryParams {
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    search: filter.search?.trim() ?? '',
    excludeGroupId: filter.excludeGroupId,
    sort: filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined,
  };
}

/** 移植元 `GroupTemplatesStore.toViewModel`。空の項目を補う */
function toViewModel(item: TemplateApiItem): TemplateApiItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    systemPrompt: item.systemPrompt ?? '',
    createdAt: item.createdAt ?? item.addedAt ?? item.updatedAt,
    updatedAt: item.updatedAt ?? item.addedAt,
    addedAt: item.addedAt,
  };
}

/** 一覧と件数 */
export interface GroupTemplatesPage {
  items: TemplateApiItem[];
  totalElements: number;
}

/**
 * 所属テンプレート一覧（移植元 `GroupTemplatesStore.load`）。
 * 読み込みに失敗したときは data が undefined になり、画面は空の一覧にする。
 *
 * @param groupId グループ ID
 * @param filter 検索・並べ替え・ページ
 */
export function useGroupTemplates(groupId: string, filter: GroupTemplateListFilter) {
  return useQuery({
    queryKey: [GROUP_TEMPLATES_QUERY_KEY, groupId, filter],
    enabled: groupId !== '',
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<GroupTemplatesPage> => {
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId), {
        params: toTenantListParams(filter),
      });
      const page = parseSpringPage(raw, mapGroupTemplateItem);
      return { items: page.content.map(toViewModel), totalElements: page.totalElements };
    },
  });
}

/**
 * 追加ダイアログの候補（移植元 `loadAddTemplateOptions`）。このグループにまだ入っていないテンプレートを取る。
 * 失敗したときは候補なしにする。
 *
 * @param groupId グループ ID
 */
export async function fetchAddTemplateOptions(groupId: string): Promise<ComboboxOption[]> {
  try {
    const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.PROMPT_TEMPLATES.LIST, {
      params: toTenantListParams({
        pageSize: ADD_OPTIONS_PAGE_SIZE,
        pageIndex: 1,
        search: '',
        excludeGroupId: groupId,
      }),
    });
    return parseSpringPage(raw, mapGroupTemplateItem).content.map(
      ({ id, name, description }) => ({ value: id, label: name, description }),
    );
  } catch {
    return [];
  }
}

/** 変更のあとに一覧を読み直す。`mutateAsync` で読み直しの完了まで待てるよう Promise を返す */
function useReloadTemplates(groupId: string) {
  const queryClient = useQueryClient();
  return async () => {
    invalidateGroupLists(queryClient);
    await queryClient.invalidateQueries({ queryKey: [GROUP_TEMPLATES_QUERY_KEY, groupId] });
  };
}

/**
 * テンプレートの追加（移植元 `GroupTemplatesStore.addTemplates`）
 *
 * @param groupId グループ ID
 */
export function useAddGroupTemplates(groupId: string) {
  const reload = useReloadTemplates(groupId);
  return useMutation({
    mutationFn: async (templateIds: string[]): Promise<void> => {
      await apiClient.post<void>(
        API_PATHS.ADMIN.GROUPS.TEMPLATES(groupId),
        { templateIds },
        OWN_ERROR_TOAST,
      );
    },
    onSuccess: reload,
  });
}

/**
 * テンプレートの削除（移植元 `GroupTemplatesStore.removeTemplates`）。
 * 1 件でも失敗したら全体を失敗として扱い、読み直しはしない（移植元の `Promise.all` と同じ）。
 *
 * @param groupId グループ ID
 */
export function useRemoveGroupTemplates(groupId: string) {
  const reload = useReloadTemplates(groupId);
  return useMutation({
    mutationFn: async (templateIds: string[]): Promise<void> => {
      await Promise.all(
        templateIds.map((id) =>
          apiClient.delete<void>(
            API_PATHS.ADMIN.GROUPS.TEMPLATE_DETAIL(groupId, id),
            OWN_ERROR_TOAST,
          ),
        ),
      );
    },
    onSuccess: reload,
  });
}
