import type { GroupAssistantListFilter } from '@/types/admin/group-management.types';
import { createGroupTabStore } from './group-tab-store';

/** 移植元 `GroupAssistantsStore` の初期値（1ページ25件・追加日時の降順） */
export const INITIAL_GROUP_ASSISTANTS_FILTER: GroupAssistantListFilter = {
  pageSize: 25,
  pageIndex: 1,
  sortField: 'addedAt',
  sortOrder: 'desc',
};

/** グループ詳細「所属アシスタント」タブの画面状態 */
export const useGroupAssistantsStore = createGroupTabStore(INITIAL_GROUP_ASSISTANTS_FILTER);
