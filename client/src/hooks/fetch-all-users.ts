import { normalizeAdminUsersListBody } from '@/components/features/admin/users/admin-users-api-normalize';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { fetchAllPages } from '@/lib/utils/fetch-all-pages';
import type { UserApiItem } from '@/types/admin/user.types';

/**
 * テナントの全ユーザーを、名前の昇順で、1 ページ 1,000 件ずつ最後のページまで順に取る（移植元 `fetchAllUsers`）。
 * 利用状況タブ・チャット履歴の、利用者の絞り込みの選択肢に使う。
 * クレジットの集計はさせない（`includeUsage: false`。選択肢に使うのは ID と名前だけで、集計はページごとに走って重い）。
 * 途中のページで失敗したときは、一部のユーザーだけの選択肢を出さないよう、そのまま失敗にする。
 * 同名のユーザーがページをまたいでも重複・欠落しないのは、backend が並び替えの最終キーに ID を加えるため。
 */
export function fetchAllUsers(): Promise<UserApiItem[]> {
  return fetchAllPages(async (page, size) => {
    const raw = await apiClient.get<unknown>(API_PATHS.ADMIN.USERS.LIST, {
      params: {
        page,
        size,
        searchText: '',
        role: '',
        sort: 'name,asc',
        includeUsage: false,
      },
    });
    const result = normalizeAdminUsersListBody(raw, { pageSize: size, pageIndex: page + 1 });
    return { items: result.data, total: result.total };
  });
}
