import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeAdminUsersListBody } from '@/components/features/admin/users/admin-users-api-normalize';
import {
  mapGroupMemberUser,
  parseSpringPage,
} from '@/components/features/admin/groups/group-api-mappers';
import { apiClient, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type {
  GroupMemberUserFilter,
  GroupUserRole,
} from '@/types/admin/group-management.types';
import type { SelectOption } from '@/components/shared/types';
import type { UserApiItem, UserFilter } from '@/types/admin/user.types';
import type { PagedResponse } from '@/types/api-response.type';
import { invalidateGroupLists } from './use-group-detail';

// 移植元 group-list の GroupUsersApiService と GroupUsersStore（API 呼び出し部分）。

/** 所属ユーザー一覧の key の先頭 */
export const GROUP_USERS_QUERY_KEY = 'admin-group-users';

/** 追加ダイアログの候補の件数（移植元 `loadAddUserOptions` の pageSize） */
const ADD_USER_OPTIONS_PAGE_SIZE = 50;

/** 追加・削除・権限変更の失敗は画面でトーストを出すので、共通のエラートーストは出さない */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

function toGroupListParams(filter: GroupMemberUserFilter): QueryParams {
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    searchText: filter.query?.trim() ?? '',
    role: filter.role,
    sort: filter.sortField ? `${filter.sortField},${filter.sortOrder ?? 'desc'}` : undefined,
    includeUsage: true,
  };
}

/** 表示名の空を後ろの項目で補う（移植元 `GroupUsersStore.toViewModel`） */
function toViewModel(item: UserApiItem): UserApiItem {
  return {
    ...item,
    displayName: item.displayName || item.name || item.userId || item.id,
    usedTokens: item.usedTokens ?? null,
    email: item.email ?? '',
    accountType: item.accountType ?? 'none',
    groupAdmin: item.groupAdmin ?? false,
  };
}

/**
 * 所属ユーザー一覧（移植元 `GroupUsersStore.load`）。
 * 読み込みに失敗したときは data が undefined になり、画面は空の一覧にする。
 *
 * @param groupId グループ ID
 * @param filter 検索・絞り込み・並べ替え・ページ
 */
export function useGroupUsers(groupId: string, filter: GroupMemberUserFilter) {
  return useQuery({
    queryKey: [GROUP_USERS_QUERY_KEY, groupId, filter],
    enabled: groupId !== '',
    // 移植元は画面を開いたときと操作したときだけ読み込む。フォーカスで再取得すると一覧がスピナーに替わってしまう
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PagedResponse<UserApiItem>> => {
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.GROUPS.USERS(groupId), {
        params: toGroupListParams(filter),
      });
      const page = parseSpringPage(raw, mapGroupMemberUser);
      return { ...page, content: page.content.map(toViewModel) };
    },
  });
}

/**
 * 追加ダイアログの候補（移植元 `loadAddUserOptions`）。このグループにまだ入っていないユーザーを取る。
 * 失敗したときは候補なしにする。
 *
 * @param groupId グループ ID
 */
export async function fetchAddUserOptions(groupId: string): Promise<SelectOption[]> {
  const filter: UserFilter = {
    pageSize: ADD_USER_OPTIONS_PAGE_SIZE,
    pageIndex: 1,
    query: '',
    excludeGroupId: groupId,
  };
  try {
    // backend は searchText・role を必須にしているため、絞り込みなしでも空文字を送る
    const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
      params: {
        page: 0,
        size: filter.pageSize,
        searchText: '',
        role: '',
        excludeGroupId: groupId,
      },
    });
    return normalizeAdminUsersListBody(raw, filter).data.map((user) => ({
      value: user.id,
      label: user.displayName || user.name || user.userId,
    }));
  } catch {
    return [];
  }
}

/**
 * 変更のあとに所属ユーザー一覧を読み直す。
 * 呼び出し元が `mutateAsync` で読み直しの完了まで待てるよう、Promise を返す（移植元は `await load()`）。
 */
function useReloadUsers(groupId: string) {
  const queryClient = useQueryClient();
  return async () => {
    invalidateGroupLists(queryClient);
    await queryClient.invalidateQueries({ queryKey: [GROUP_USERS_QUERY_KEY, groupId] });
  };
}

/**
 * ユーザーの追加（移植元 `GroupUsersStore.addUsers`）
 *
 * @param groupId グループ ID
 */
export function useAddGroupUsers(groupId: string) {
  const reload = useReloadUsers(groupId);
  return useMutation({
    mutationFn: async (userIds: string[]): Promise<void> => {
      await apiClient.post<void>(API_PATHS.ADMIN.GROUPS.USERS(groupId), { userIds }, OWN_ERROR_TOAST);
    },
    onSuccess: reload,
  });
}

/**
 * ユーザーの削除（移植元 `GroupUsersStore.removeUsers`）。
 * 1 件でも失敗したら全体を失敗として扱い、読み直しはしない（移植元の `Promise.all` と同じ）。
 *
 * @param groupId グループ ID
 */
export function useRemoveGroupUsers(groupId: string) {
  const reload = useReloadUsers(groupId);
  return useMutation({
    mutationFn: async (userIds: string[]): Promise<void> => {
      await Promise.all(
        userIds.map((userId) =>
          apiClient.delete<void>(API_PATHS.ADMIN.GROUPS.USER_DETAIL(groupId, userId), OWN_ERROR_TOAST),
        ),
      );
    },
    onSuccess: reload,
  });
}

/** 権限の変更に必要な値 */
export interface UpdateGroupUserRoleVariables {
  userId: string;
  role: GroupUserRole;
}

/**
 * グループ内の権限の変更（移植元 `GroupUsersStore.updateUserRole`）
 *
 * @param groupId グループ ID
 */
export function useUpdateGroupUserRole(groupId: string) {
  const reload = useReloadUsers(groupId);
  return useMutation({
    mutationFn: async ({ userId, role }: UpdateGroupUserRoleVariables): Promise<void> => {
      await apiClient.patch<void>(
        API_PATHS.ADMIN.GROUPS.USER_DETAIL(groupId, userId),
        { groupAdmin: role === 'admin' },
        OWN_ERROR_TOAST,
      );
    },
    onSuccess: reload,
  });
}
