import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  normalizeTrainingDataListBody,
  indexRowToApiItem,
  type IndexRow,
} from '@/components/features/admin/training-data/training-data-api-normalize';
import {
  LOCAL_FOLDER_ENDPOINT_TYPE,
  SAAS_GLOBAL_ENDPOINT_TYPES,
  resolveInitialEndpointId,
  resolveSaasGlobalEndpointIds,
  toEndpointSelectOptions,
  type CreateIndexPayload,
  type TenantEndpointOption,
  type TenantEndpointType,
  type TrainingFolderType,
} from '@/components/features/admin/training-data/training-folder-form';
import type { SelectOption } from '@/components/shared/types';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { PagedResponse } from '@/types/api-response.type';
import type { TrainingDataApiResponse, TrainingDataFilter } from '@/types/training-data.types';

// 移植元 training-data の TrainingApiService（一覧・作成・接続先候補・グループ）と
// TrainingFolderModalService の通信部分。

export const TRAINING_DATA_QUERY_KEY = 'admin-training-data';

/** 移植元 `TRAINING_FOLDER_GROUP_PAGE_SIZE` */
const GROUP_PAGE_SIZE = 100;

/** 一覧の並べ替えで方向が空のときの既定（移植元 `toListParams`） */
const DEFAULT_SORT_ORDER = 'desc';

function listKey(filter: TrainingDataFilter) {
  return [TRAINING_DATA_QUERY_KEY, 'list', filter] as const;
}

/** 移植元 `TrainingApiService.list`。失敗時の共通エラートーストは api-client が出す */
export function useTrainingDataList(filter: TrainingDataFilter) {
  return useQuery({
    queryKey: listKey(filter),
    // 移植元は読み込み中も一覧を出したままにする。切り替わりでカードを消さない
    placeholderData: keepPreviousData,
    // 移植元は画面を開いたときと操作したときだけ読み込む
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<TrainingDataApiResponse> => {
      const raw = await apiClient.get<PagedResponse<IndexRow>>(API_PATHS.INDEXES.LIST, {
        params: {
          page: Math.max(0, filter.pageIndex - 1),
          size: filter.pageSize,
          searchText: filter.query?.trim() ?? '',
          sort: filter.sortField
            ? `${filter.sortField},${filter.sortOrder || DEFAULT_SORT_ORDER}`
            : undefined,
        },
      });
      return normalizeTrainingDataListBody(raw);
    },
  });
}

/**
 * 移植元 `TrainingDataStore.createFolder`。
 * 一覧は取り直さず、作ったフォルダを現在の一覧の先頭に足して件数を 1 増やす（移植元と同じ）。
 */
export function useCreateTrainingFolder(filter: TrainingDataFilter) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateIndexPayload) =>
      apiClient.post<IndexRow>(API_PATHS.INDEXES.CREATE, payload),
    onSuccess: (created) => {
      const item = indexRowToApiItem(created);
      queryClient.setQueryData<TrainingDataApiResponse>(listKey(filter), (current) =>
        current ? { ...current, data: [item, ...current.data], total: current.total + 1 } : current,
      );
    },
  });
}

/** 移植元 `listEndpointsByType`。接続先の種類ごとの候補 */
async function listEndpointsByType(type: TenantEndpointType): Promise<TenantEndpointOption[]> {
  const rows = await apiClient.get<TenantEndpointOption[]>(
    API_PATHS.ADMIN.TENANTS.ENDPOINTS_BY_TYPE(type),
  );
  return rows.map(({ id, endpointName }) => ({ id, endpointName }));
}

/** 移植元 `normalizeGroupListPage`。backend は `{ data, total }`、`{ content, totalElements }` の両方を受ける */
interface GroupPage {
  ids: string[];
  total: number;
}

interface GroupListBody {
  data?: { id: string }[];
  total?: number;
  content?: { id: string }[];
  totalElements?: number;
}

function toGroupPage(raw: GroupListBody): GroupPage {
  const rows = raw.content ?? raw.data ?? [];
  return {
    ids: rows.map((row) => row.id),
    total: raw.totalElements ?? raw.total ?? rows.length,
  };
}

/**
 * 移植元 `listAllGroupIds`。フォルダはテナントの全グループに紐づける（移植元と同じ）。
 * 総数に届かないまま空のページが返ったら、無限に取り続けないよう止める。
 */
export async function listAllGroupIds(): Promise<string[]> {
  const ids: string[] = [];
  let page = 0;
  let total = 0;

  do {
    const raw = await apiClient.get<GroupListBody>(API_PATHS.ADMIN.GROUPS.LIST, {
      params: { page, size: GROUP_PAGE_SIZE },
    });
    const groupPage = toGroupPage(raw);
    ids.push(...groupPage.ids);
    total = groupPage.total;
    page += 1;
    if (groupPage.ids.length === 0) break;
  } while (ids.length < total);

  return ids;
}

/** 接続サーバーを選んだときに決まる、接続先の候補と選択 */
export interface FolderEndpointState {
  /** ローカル接続の選択肢（クラウドは空） */
  options: SelectOption[];
  /** 作成時に送るエンドポイント ID（ローカルは 1 つ、クラウドは 2 つ） */
  selectedEndpointIds: string[];
  hasNoEndpoints: boolean;
  /** ローカル接続の初期選択（先頭）。クラウドは null */
  localEndpointId: string | null;
}

/** 移植元 `TrainingFolderModalService.loadEndpointsForType` */
export async function loadEndpointsForType(
  folderType: TrainingFolderType,
  existingEndpointIds?: string[],
): Promise<FolderEndpointState> {
  if (folderType === 'SAAS_GLOBAL') {
    const [vdbEndpoints, embeddingEndpoints] = await Promise.all(
      SAAS_GLOBAL_ENDPOINT_TYPES.map((type) => listEndpointsByType(type)),
    );
    const endpointIds = resolveSaasGlobalEndpointIds(
      toEndpointSelectOptions(vdbEndpoints),
      toEndpointSelectOptions(embeddingEndpoints),
      existingEndpointIds,
    );
    return {
      options: [],
      selectedEndpointIds: endpointIds ?? [],
      hasNoEndpoints: !endpointIds,
      localEndpointId: null,
    };
  }

  const options = toEndpointSelectOptions(await listEndpointsByType(LOCAL_FOLDER_ENDPOINT_TYPE));
  const localEndpointId = resolveInitialEndpointId(options, existingEndpointIds?.[0]);
  return {
    options,
    selectedEndpointIds: localEndpointId ? [localEndpointId] : [],
    hasNoEndpoints: options.length === 0,
    localEndpointId,
  };
}
