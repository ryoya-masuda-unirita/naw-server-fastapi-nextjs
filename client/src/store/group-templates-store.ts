import type { GroupTemplateListFilter } from '@/types/admin/group-management.types';
import { createGroupTabStore } from './group-tab-store';

/** 移植元 `GroupTemplatesStore` の初期値（1ページ25件・追加日時の降順） */
export const INITIAL_GROUP_TEMPLATES_FILTER: GroupTemplateListFilter = {
  pageSize: 25,
  pageIndex: 1,
  sortField: 'addedAt',
  sortOrder: 'desc',
};

/** グループ詳細「所属テンプレート」タブの画面状態 */
export const useGroupTemplatesStore = createGroupTabStore(INITIAL_GROUP_TEMPLATES_FILTER);
