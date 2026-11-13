import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASSISTANT_SERVER_TYPE,
  NO_CATEGORY_OPTION,
  NO_TEAM_OPTION,
} from '@/components/features/admin/assistants/assistant-list.constants';
import type { SelectOption } from '@/components/shared/types';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type {
  AssistantApiItem,
  AssistantCategoryApiItem,
  AssistantFilter,
  AssistantMutationPayload,
} from '@/types/admin/assistant.types';
import type { GroupApiResponse } from '@/types/admin/group-management.types';
import type { PagedResponse } from '@/types/api-response.type';

// 移植元 assistant-list の AssistantListApiService と、2 つの store の API 呼び出し部分をまとめたもの。

/**
 * サイドバーが `/dashboard`・`/chat/new` へ移るたびに無効化する key の先頭（#277）。
 * 一覧・選択肢・カテゴリ・変更後の再取得もこの先頭にそろえる。
 */
const ASSISTANTS_QUERY_KEY = 'assistants';

/** 移植元 `getFolderOptions` が学習先フォルダとして取る件数 */
const FOLDER_OPTIONS_SIZE = '1000';
const SAAS_GLOBAL_INDEX_TYPE = 'SAAS_GLOBAL';

const ASSISTANT_TYPES = [
  ASSISTANT_SERVER_TYPE.SECURE,
  ASSISTANT_SERVER_TYPE.SAAS_CHAT,
  ASSISTANT_SERVER_TYPE.SAAS_RAG,
] as const;

interface AssistantEndpointOptionResponse {
  id: string;
  endpointName: string;
  type: string;
}

interface AssistantModelResponse {
  name: string;
  endpointType: string;
  active: boolean;
}

interface AssistantIndexOptionResponse {
  id: string;
  type: string;
  name: string;
}

type AssistantIndexListResponse =
  | AssistantIndexOptionResponse[]
  | { data: AssistantIndexOptionResponse[] }
  | { content: AssistantIndexOptionResponse[] };

/** カテゴリの作成・更新の本文（移植元は any） */
export interface AssistantCategoryPayload {
  name: string;
  description: string;
}

/** ダイアログとフィルターの選択肢（移植元 `AssistantListStore.loadOptions` の結果） */
export interface AssistantOptions {
  categoriesOptions: SelectOption[];
  groupOptions: SelectOption[];
  /** 接続サーバーの種類 → 接続先 API の選択肢 */
  serverApiOptions: Record<string, SelectOption[]>;
  /** 接続サーバーの種類 → 接続先 API の ID → モデルの選択肢 */
  modelOptions: Record<string, Record<string, SelectOption[]>>;
  folderOptions: SelectOption[];
}

function toListParams(filter: AssistantFilter): Record<string, string | number | undefined> {
  const search = filter.search?.trim() || filter.query.trim();
  return {
    page: Math.max(0, filter.pageIndex),
    size: filter.pageSize,
    sort: filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined,
    type: filter.filterServer || undefined,
    categoryId: filter.filterCategory || undefined,
    groupId: filter.filterTeam || undefined,
    search: search || undefined,
    excludeGroupId: filter.excludeGroupId || undefined,
  };
}

/** 移植元 `AssistantListStore.loadItems`。失敗時の共通エラートーストは api-client が出す */
export function useAssistantList(filter: AssistantFilter) {
  return useQuery({
    queryKey: [ASSISTANTS_QUERY_KEY, 'admin', filter],
    // 移植元は読み込み中も前の一覧を出したままにする
    placeholderData: keepPreviousData,
    // 移植元は画面を開いたときと操作したときだけ読み込む
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<PagedResponse<AssistantApiItem>>(API_PATHS.ADMIN.ASSISTANTS.LIST, {
        params: toListParams(filter),
      }),
  });
}

/** 移植元 `AssistantListStore.loadItems`（カテゴリ）。並べ替え・ページ分けは画面側で行う */
export function useAssistantCategories() {
  return useQuery({
    queryKey: [ASSISTANTS_QUERY_KEY, 'admin-categories'],
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<AssistantCategoryApiItem[]>(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.LIST),
  });
}

async function fetchEndpointsByType(): Promise<Record<string, AssistantEndpointOptionResponse[]>> {
  const entries = await Promise.all(
    ASSISTANT_TYPES.map(
      async (type) =>
        [
          type,
          await apiClient.get<AssistantEndpointOptionResponse[]>(
            API_PATHS.ADMIN.ASSISTANTS.ENDPOINTS_BY_TYPE(type),
          ),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

async function fetchApiOptions(): Promise<Record<string, SelectOption[]>> {
  const endpointsByType = await fetchEndpointsByType();
  return Object.fromEntries(
    Object.entries(endpointsByType).map(([type, endpoints]) => [
      type,
      endpoints.map((endpoint) => ({ value: endpoint.id, label: endpoint.endpointName })),
    ]),
  );
}

async function fetchModelOptions(): Promise<Record<string, Record<string, SelectOption[]>>> {
  const [endpointsByType, models] = await Promise.all([
    fetchEndpointsByType(),
    apiClient.get<AssistantModelResponse[]>(API_PATHS.ADMIN.ASSISTANTS.AI_MODELS),
  ]);
  return Object.fromEntries(
    Object.entries(endpointsByType).map(([assistantType, endpoints]) => [
      assistantType,
      Object.fromEntries(
        endpoints.map((endpoint) => [
          endpoint.id,
          models
            .filter((model) => model.active && model.endpointType === endpoint.type)
            .map((model) => ({ value: model.name, label: model.name })),
        ]),
      ),
    ]),
  );
}

async function fetchGroupOptions(): Promise<SelectOption[]> {
  const response = await apiClient.get<GroupApiResponse>(API_PATHS.ADMIN.ALL_GROUPS.LIST);
  return response.data.map((group) => ({ value: group.id, label: group.name }));
}

async function fetchFolderOptions(): Promise<SelectOption[]> {
  const response = await apiClient.get<AssistantIndexListResponse>(API_PATHS.INDEXES.LIST, {
    params: { size: FOLDER_OPTIONS_SIZE },
  });
  let indexes: AssistantIndexOptionResponse[];
  if (Array.isArray(response)) {
    indexes = response;
  } else if ('content' in response && Array.isArray(response.content)) {
    indexes = response.content;
  } else {
    indexes = (response as { data?: AssistantIndexOptionResponse[] }).data ?? [];
  }
  return indexes
    .filter((index) => index.type === SAAS_GLOBAL_INDEX_TYPE)
    .map((index) => ({ value: index.id, label: index.name }));
}

/** 失敗した選択肢だけ空にして続ける（移植元 `Promise.allSettled` と同じ） */
function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  if (result.status === 'fulfilled') return result.value;
  console.error('Failed to load assistant option', result.reason);
  return fallback;
}

/**
 * フィルター・ダイアログの選択肢。移植元 `AssistantListStore.loadOptions`。
 * 取れなかった選択肢は空として扱う（共通のエラートーストは api-client が出す）。
 */
export function useAssistantOptions() {
  return useQuery({
    queryKey: [ASSISTANTS_QUERY_KEY, 'admin-options'],
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AssistantOptions> => {
      const [categories, groups, serverApi, models, folders] = await Promise.allSettled([
        apiClient.get<AssistantCategoryApiItem[]>(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.LIST),
        fetchGroupOptions(),
        fetchApiOptions(),
        fetchModelOptions(),
        fetchFolderOptions(),
      ]);
      return {
        categoriesOptions: [
          NO_CATEGORY_OPTION,
          ...settledValue(categories, []).map((category) => ({
            value: category.id,
            label: category.name,
          })),
        ],
        groupOptions: [NO_TEAM_OPTION, ...settledValue(groups, [])],
        serverApiOptions: settledValue(serverApi, {}),
        modelOptions: settledValue(models, {}),
        folderOptions: settledValue(folders, []),
      };
    },
  });
}

function useInvalidateAssistants() {
  const queryClient = useQueryClient();
  // 一覧・カテゴリ・選択肢を最新にする（カテゴリの増減はアシスタントの選択肢にも効く）
  return () => queryClient.invalidateQueries({ queryKey: [ASSISTANTS_QUERY_KEY] });
}

export function useCreateAssistant() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: (payload: AssistantMutationPayload) =>
      apiClient.post<AssistantApiItem>(API_PATHS.ADMIN.ASSISTANTS.LIST, payload, {
        skipGlobalErrorToast: true,
      }),
    onSettled: invalidate,
  });
}

export interface UpdateAssistantVariables {
  id: string;
  payload: AssistantMutationPayload;
}

export function useUpdateAssistant() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateAssistantVariables) =>
      apiClient.patch<AssistantApiItem>(API_PATHS.ADMIN.ASSISTANTS.DETAIL(id), payload, {
        skipGlobalErrorToast: true,
      }),
    onSettled: invalidate,
  });
}

/** 選択した分をまとめて削除する（移植元 `submitDeleteAssistants`）。409 は呼び出し側で判定する */
export function useDeleteAssistants() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          apiClient.delete<void>(API_PATHS.ADMIN.ASSISTANTS.DETAIL(id), {
            skipGlobalErrorToast: true,
          }),
        ),
      ),
    onSettled: invalidate,
  });
}

export function useCreateAssistantCategory() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: (payload: AssistantCategoryPayload) =>
      apiClient.post<AssistantCategoryApiItem>(
        API_PATHS.ADMIN.ASSISTANT_CATEGORIES.LIST,
        payload,
        { skipGlobalErrorToast: true },
      ),
    onSettled: invalidate,
  });
}

export interface UpdateAssistantCategoryVariables {
  id: string;
  payload: AssistantCategoryPayload;
}

export function useUpdateAssistantCategory() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateAssistantCategoryVariables) =>
      apiClient.patch<AssistantCategoryApiItem>(
        API_PATHS.ADMIN.ASSISTANT_CATEGORIES.DETAIL(id),
        payload,
        { skipGlobalErrorToast: true },
      ),
    onSettled: invalidate,
  });
}

export function useDeleteAssistantCategories() {
  const invalidate = useInvalidateAssistants();
  return useMutation({
    mutationFn: (ids: string[]) =>
      Promise.all(
        ids.map((id) =>
          apiClient.delete<void>(API_PATHS.ADMIN.ASSISTANT_CATEGORIES.DETAIL(id), {
            skipGlobalErrorToast: true,
          }),
        ),
      ),
    onSettled: invalidate,
  });
}
