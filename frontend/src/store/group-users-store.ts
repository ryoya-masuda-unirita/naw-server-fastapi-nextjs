import type { GroupMemberUserFilter } from '@/types/admin/group-management.types';
import { createGroupTabStore } from './group-tab-store';

/** 移植元 `GroupUsersStore` の初期値（1ページ25件・更新日時の降順） */
export const INITIAL_GROUP_USERS_FILTER: GroupMemberUserFilter = {
  query: '',
  pageSize: 25,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

/** グループ詳細「所属ユーザー」タブの画面状態 */
export const useGroupUsersStore = createGroupTabStore(INITIAL_GROUP_USERS_FILTER);
