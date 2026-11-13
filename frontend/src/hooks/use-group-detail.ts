import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { mapGroupDetail } from '@/components/features/admin/groups/group-api-mappers';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { GroupDetailApiItem, GroupNamePayload } from '@/types/admin/group-management.types';
import { GROUP_LIST_QUERY_KEY, GROUP_OPTIONS_QUERY_KEY } from './use-group-list';

// 移植元 group-list の GroupApiService（getById・update・delete）と GroupDetailComponent の読み込み。

/** グループ詳細の key の先頭 */
export const GROUP_DETAIL_QUERY_KEY = 'admin-group-detail';

/** 成功・失敗のトーストは画面で出すので、共通のエラートーストは出さない（移植元の skipGlobalErrorToast） */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

/**
 * グループ名などが変わったとき、一覧画面とグループ選択肢の古いキャッシュを捨てる。
 * 移植元の一覧は画面を開くたびに読み直すが、React ではキャッシュが残るため明示する。
 *
 * @param queryClient TanStack Query のクライアント
 */
export function invalidateGroupLists(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [GROUP_LIST_QUERY_KEY] });
  void queryClient.invalidateQueries({ queryKey: [GROUP_OPTIONS_QUERY_KEY] });
}

/**
 * グループ詳細（移植元 `GroupDetailComponent.loadGroup`）。
 * 失敗したときは data が undefined になり、画面はグループ名を空で出す（移植元の `groupName.set('')`）。
 *
 * @param groupId グループ ID
 */
export function useGroupDetail(groupId: string) {
  return useQuery({
    queryKey: [GROUP_DETAIL_QUERY_KEY, groupId],
    enabled: groupId !== '',
    // 移植元はグループが切り替わったときだけ読み込む
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<GroupDetailApiItem> =>
      mapGroupDetail(await apiClient.get<unknown>(API_PATHS.ADMIN.GROUPS.DETAIL(groupId))),
  });
}

/**
 * チーム名の更新（移植元 `GroupApiService.update`）。
 * 成功したら画面のグループ名を応答の名前に置き換える。
 *
 * @param groupId グループ ID
 */
export function useUpdateGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GroupNamePayload): Promise<GroupDetailApiItem> =>
      mapGroupDetail(
        await apiClient.patch<unknown>(
          API_PATHS.ADMIN.GROUPS.DETAIL(groupId),
          payload,
          OWN_ERROR_TOAST,
        ),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData([GROUP_DETAIL_QUERY_KEY, groupId], updated);
      invalidateGroupLists(queryClient);
    },
  });
}

/**
 * チームの削除（移植元 `GroupApiService.delete`）
 *
 * @param groupId グループ ID
 */
export function useDeleteGroup(groupId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      await apiClient.delete<unknown>(API_PATHS.ADMIN.GROUPS.DETAIL(groupId), OWN_ERROR_TOAST);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [GROUP_DETAIL_QUERY_KEY, groupId] });
      invalidateGroupLists(queryClient);
    },
  });
}
