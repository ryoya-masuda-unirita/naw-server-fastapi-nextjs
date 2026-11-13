import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { TagItem } from '@/types/admin/library.types';
import type { PagedResponse } from '@/types/api-response.type';

// 移植元 library-list/components/tags-tab の TagsApiService・TagsStore（API 部分）

const TAGS_QUERY_KEY = 'library-tags';
/** コンテンツタブのタグの選択肢（use-library-list.ts）。タグを変えたら取り直す */
const TAG_OPTIONS_QUERY_KEY = ['library', 'tag-options'];

export interface TagListParams {
  page: number;
  size: number;
  sort: string;
}

export interface TagPayload {
  name: string;
  description?: string;
}

/**
 * タグ一覧の取得（移植元 `TagsApiService.list`）。
 * backend は `sort` を受けず名前の昇順で返す（docs/issue-136/03 を参照）。
 */
export function useAdminTagList(params: TagListParams) {
  return useQuery({
    queryKey: [TAGS_QUERY_KEY, 'list', params],
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<PagedResponse<TagItem>>(API_PATHS.ADMIN_LIBRARY_TAGS.LIST, {
        params: { ...params },
      }),
  });
}

function useInvalidateTags() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: [TAGS_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: TAG_OPTIONS_QUERY_KEY }),
    ]);
}

/** 移植元 `TagsStore.createTag`。失敗の通知は呼び出し側が出す */
export function useCreateTag() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (payload: TagPayload) =>
      apiClient.post<TagItem>(API_PATHS.ADMIN_LIBRARY_TAGS.CREATE, payload, {
        skipGlobalErrorToast: true,
      }),
    onSuccess: invalidate,
  });
}

/**
 * 移植元 `TagsStore.updateTag`。一覧は取り直さず、返ってきた 1 件で差し替える
 * （並べ替え順が変わって編集した行が動かないようにするため）。
 */
export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TagPayload }) =>
      apiClient.patch<TagItem>(API_PATHS.ADMIN_LIBRARY_TAGS.UPDATE(id), payload, {
        skipGlobalErrorToast: true,
      }),
    onSuccess: (updated) => {
      queryClient.setQueriesData<PagedResponse<TagItem>>(
        { queryKey: [TAGS_QUERY_KEY, 'list'] },
        (old) =>
          old && {
            ...old,
            content: old.content.map((tag) => (tag.id === updated.id ? updated : tag)),
          },
      );
      void queryClient.invalidateQueries({ queryKey: TAG_OPTIONS_QUERY_KEY });
    },
  });
}

/** 移植元 `TagsStore.deleteTag`・`deleteTags`（ids をまとめて送る） */
export function useDeleteTags() {
  const invalidate = useInvalidateTags();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiClient.delete<void>(API_PATHS.ADMIN_LIBRARY_TAGS.DELETE, { body: { ids } }),
    onSuccess: invalidate,
  });
}
