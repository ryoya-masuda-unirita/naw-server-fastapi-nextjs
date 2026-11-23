import { create } from 'zustand';
import type { GroupListFilter } from '@/types/admin/group-management.types';

/** 移植元 `GroupListStore` の初期値（1ページ5件・更新日時の降順） */
export const INITIAL_GROUP_LIST_FILTER: GroupListFilter = {
  pageSize: 5,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface GroupListStore {
  filter: GroupListFilter;
  /** 検索・並べ替えの変更。1ページ目へ戻す */
  updateFilter: (filter: Partial<GroupListFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  reset: () => void;
}

/** 移植元 `GroupListStore` のうち画面の状態（API から取る一覧は TanStack Query） */
export const useGroupListStore = create<GroupListStore>((set) => ({
  filter: INITIAL_GROUP_LIST_FILTER,
  updateFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter, pageIndex: 1 } })),
  updatePageIndex: (pageIndex) => set((state) => ({ filter: { ...state.filter, pageIndex } })),
  reset: () => set({ filter: INITIAL_GROUP_LIST_FILTER }),
}));
