import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, type QueryParams } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { normalizeAdminUsersListBody } from '@/components/features/admin/users/admin-users-api-normalize';
import type {
  LoginKeyAction,
  UserApiResponse,
  UserApiRole,
  UserCreateApiResponse,
  UserFilter,
  UserUpdateApiResponse,
} from '@/types/admin/user.types';

export const ADMIN_USERS_QUERY_KEY = ['admin-users'] as const;

/** 移植元 user-list-api.service の CreateUserPayload */
export interface CreateUserPayload {
  loginId: string;
  name: string;
  role: UserApiRole;
  /** true ならログインキーをサーバーで発行する */
  issueLoginKey?: boolean;
}

/** 移植元 user-list-api.service の UpdateUserPayload */
export interface UpdateUserPayload {
  name?: string;
  resetPassword?: boolean;
  role?: UserApiRole;
  /** 省略は KEEP */
  loginKeyAction?: LoginKeyAction;
}

const ROLE_PARAM: Record<string, string> = {
  admin: 'ADMIN',
  system: 'SYSTEM',
  user: 'USER',
};

/** 移植元 toParams。backend は searchText・role を必須にしているため、絞り込みなしでも空文字を送る */
function toListParams(filter: UserFilter): QueryParams {
  const sortOrder = filter.sortOrder ?? 'desc';
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    searchText: filter.query?.trim() ?? '',
    role: filter.role ? ROLE_PARAM[filter.role] : '',
    sort: filter.sortField ? `${filter.sortField},${sortOrder}` : undefined,
    includeUsage: true,
  };
}

/** ユーザー一覧（移植元 UserListStore.loadItems）。再取得のたびに isFetching が true になる */
export function useAdminUsers(filter: UserFilter) {
  return useQuery<UserApiResponse>({
    queryKey: [...ADMIN_USERS_QUERY_KEY, filter],
    queryFn: async () => {
      const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
        params: toListParams(filter),
      });
      return normalizeAdminUsersListBody(raw, filter);
    },
    // 移植元の store は画面を開くたび・条件を変えるたびに読み直すだけで、フォーカスでは読み直さない
    refetchOnWindowFocus: false,
  });
}

/** 作成・更新・削除の失敗は画面でトーストを出すので、共通のエラートーストは出さない */
const OWN_ERROR_TOAST = { skipGlobalErrorToast: true } as const;

export function useCreateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateUserPayload) =>
      apiClient.post<UserCreateApiResponse>(API_PATHS.ADMIN.USERS.LIST, payload, OWN_ERROR_TOAST),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });
}

export function useUpdateAdminUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ loginId, payload }: { loginId: string; payload: UpdateUserPayload }) =>
      apiClient.patch<UserUpdateApiResponse>(
        API_PATHS.ADMIN.USERS.DETAIL(loginId),
        payload,
        OWN_ERROR_TOAST
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });
}

/** 選んだユーザーを 1 件ずつ並行して削除する（移植元 submitDeleteUsers。1 件でも失敗したら全体を失敗にする） */
export function useDeleteAdminUsers() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (loginIds: string[]) => {
      await Promise.all(
        loginIds.map((loginId) =>
          apiClient.delete<unknown>(API_PATHS.ADMIN.USERS.DETAIL(loginId), OWN_ERROR_TOAST)
        )
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY }),
  });
}
