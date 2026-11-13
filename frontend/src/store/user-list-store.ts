import { create } from 'zustand';
import { INITIAL_USER_LIST_FILTER } from '@/components/features/admin/users/user-list.constants';
import type { UserFilter } from '@/types/admin/user.types';

interface UserListStore {
  filter: UserFilter;
  selectedIds: ReadonlySet<string>;
  /** 条件を変えたら 1 ページ目に戻し、選択を外す */
  updateFilter: (filter: Partial<UserFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  /** 作成後など、role・検索語・ページを既定に戻す */
  resetFilter: () => void;
  toggleSelected: (id: string, checked: boolean) => void;
  toggleSelectAll: (checked: boolean, ids: readonly string[]) => void;
  clearSelection: () => void;
}

/** 移植元 UserListStore の UI 状態（一覧のデータは useAdminUsers が持つ）。移植元と同じく画面を離れても条件を残す */
export const useUserListStore = create<UserListStore>((set) => ({
  filter: { ...INITIAL_USER_LIST_FILTER },
  selectedIds: new Set<string>(),
  updateFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter, pageIndex: 1 },
      selectedIds: new Set<string>(),
    })),
  updatePageIndex: (pageIndex) =>
    set((state) => ({
      filter: { ...state.filter, pageIndex },
      selectedIds: new Set<string>(),
    })),
  resetFilter: () =>
    set({ filter: { ...INITIAL_USER_LIST_FILTER }, selectedIds: new Set<string>() }),
  toggleSelected: (id, checked) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (checked) next.add(id);
      else next.delete(id);
      return { selectedIds: next };
    }),
  toggleSelectAll: (checked, ids) =>
    set({ selectedIds: checked ? new Set(ids) : new Set<string>() }),
  clearSelection: () => set({ selectedIds: new Set<string>() }),
}));
