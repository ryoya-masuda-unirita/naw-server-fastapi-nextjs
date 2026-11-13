import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { deleteLocalLibraryCopy } from '@/lib/utils/library-local-copy';
import type {
  LibraryGroupRef,
  LibraryListParams,
  LibraryPageItem,
  LibraryTagRef,
  LibraryUpdatePayload,
} from '@/types/admin/library.types';
import type { PagedResponse } from '@/types/api-response.type';
import type { LibraryTagsResponse } from '@/types/chat/library-api.type';
import type { MessageListAssistant } from '@/types/chat/message-api.type';

// 移植元 library-list/components/content-tab の LibraryApiService・LibraryStore と、
// 一覧の絞り込み・編集に使う TagsService・TeamsService・UserService.profileQuery をまとめたもの。

const LIBRARY_QUERY_KEY = 'library';

/** 移植元どおり `GET /api/libraries` は `{ data: Page }` で包んで返る */
interface LibraryListApiResponse {
  data: PagedResponse<LibraryPageItem>;
}

/** 移植元 TeamsService の `GroupListApiResponse`。backend の `GET /api/groups` は配列を返す */
interface GroupListApiItem {
  id: string;
  name: string;
}
type GroupListApiResponse = GroupListApiItem[] | { data: GroupListApiItem[]; total?: number };

/** 移植元 UserService の `UserProfile` のうちこの画面が使う値 */
interface UserProfile {
  id: string;
}

/** 一覧の取得（移植元 `LibraryApiService.list`）。失敗時の共通エラートーストは api-client が出す */
export function useLibraryList(params: LibraryListParams) {
  return useQuery({
    queryKey: [LIBRARY_QUERY_KEY, 'list', params],
    // 移植元は画面を開いたときと操作したときだけ読み込む。フォーカスで再取得すると一覧がスケルトンに替わってしまう
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PagedResponse<LibraryPageItem>> => {
      const res = await apiClient.get<LibraryListApiResponse>(API_PATHS.ADMIN.LIBRARY.LIST, {
        params: { ...params },
      });
      return res.data;
    },
  });
}

/** 絞り込み・編集ダイアログのタグの選択肢（移植元 `TagsService.loadTags`） */
export function useLibraryTagOptions() {
  return useQuery({
    queryKey: [LIBRARY_QUERY_KEY, 'tag-options'],
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<LibraryTagRef[]> => {
      const res = await apiClient.get<LibraryTagsResponse>(API_PATHS.LIBRARIES.TAGS);
      return res.tags.map((tag) => ({ id: tag.id, name: tag.name }));
    },
  });
}

/**
 * 編集ダイアログの共有先グループの選択肢（移植元 `TeamsService.loadTeams`）。
 * 移植元は編集ダイアログを開いたときに初めて取得してキャッシュするので、`enabled` でそのタイミングまで取らない。
 */
export function useLibraryGroupOptions(enabled: boolean) {
  return useQuery({
    queryKey: [LIBRARY_QUERY_KEY, 'group-options'],
    enabled,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    queryFn: async (): Promise<LibraryGroupRef[]> => {
      const res = await apiClient.get<GroupListApiResponse>(API_PATHS.GROUPS.LIST);
      const items = Array.isArray(res) ? res : (res.data ?? []);
      return items.map((group) => ({ id: group.id, name: group.name }));
    },
  });
}

/** ログインユーザーの UUID。一覧の作成者 ID（`userId`）との一致で所有者を判定するのに使う */
export function useUserProfileId(): string {
  const query = useQuery({
    queryKey: ['user', 'profile'],
    queryFn: () => apiClient.get<UserProfile>(API_PATHS.USERS.PROFILE),
  });
  return query.data?.id ?? '';
}

function useInvalidateLibraryList() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: [LIBRARY_QUERY_KEY, 'list'] });
}

export interface UpdateLibraryVariables {
  id: string;
  payload: LibraryUpdatePayload;
}

/** 移植元 `LibraryApiService.update`。失敗の通知は呼び出し側（編集ダイアログ）が出す */
export function useUpdateLibrary() {
  const invalidate = useInvalidateLibraryList();
  return useMutation({
    mutationFn: ({ id, payload }: UpdateLibraryVariables) =>
      apiClient.put<unknown>(API_PATHS.ADMIN.LIBRARY.UPDATE(id), payload, {
        skipGlobalErrorToast: true,
      }),
    onSuccess: invalidate,
  });
}

/** 詳細が取れなければローカルサーバーの本文は消せないので、アシスタントなし（NAW のみ）として進める */
async function fetchAssistantForDelete(id: string): Promise<MessageListAssistant | null> {
  try {
    const detail = await apiClient.get<{ assistant?: MessageListAssistant | null }>(
      API_PATHS.LIBRARY.DETAIL(id),
      { skipGlobalErrorToast: true },
    );
    return detail.assistant ?? null;
  } catch {
    return null;
  }
}

/**
 * 移植元 `LibraryApiService.delete`。NAW のライブラリを消してから、ローカルサーバーの本文を消す。
 * 失敗の通知は呼び出し側（削除ダイアログ）が出す。
 */
export function useDeleteLibrary() {
  const invalidate = useInvalidateLibraryList();
  return useMutation({
    mutationFn: async (id: string) => {
      const assistant = await fetchAssistantForDelete(id);
      await apiClient.delete<void>(API_PATHS.ADMIN.LIBRARY.DELETE(id), {
        skipGlobalErrorToast: true,
      });
      await deleteLocalLibraryCopy(id, assistant);
    },
    onSuccess: invalidate,
  });
}
