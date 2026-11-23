import { create } from 'zustand';

/** グループ詳細の 3 つのタブ（移植元 GroupUsersStore・GroupAssistantsStore・GroupTemplatesStore）共通の画面状態 */
export interface GroupTabStore<F extends { pageIndex: number }> {
  filter: F;
  selectedIds: ReadonlySet<string>;
  /** 検索・絞り込み・並べ替えの変更。1ページ目へ戻し、選択を解除する */
  updateFilter: (filter: Partial<F>) => void;
  updatePageIndex: (pageIndex: number) => void;
  toggleSelected: (id: string, checked: boolean) => void;
  /** 全選択。読み込み済みの行の ID を渡す */
  toggleSelectAll: (checked: boolean, ids: string[]) => void;
  clearSelection: () => void;
  reset: () => void;
}

/**
 * 3 つのタブの store を作る。API から取る一覧は TanStack Query に任せ、ここは条件と選択だけ持つ。
 *
 * @param initialFilter 画面を開いたときの条件（移植元 store の initialState.filter）
 */
export function createGroupTabStore<F extends { pageIndex: number }>(initialFilter: F) {
  return create<GroupTabStore<F>>((set) => ({
    filter: initialFilter,
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
    toggleSelected: (id, checked) =>
      set((state) => {
        const next = new Set(state.selectedIds);
        if (checked) next.add(id);
        else next.delete(id);
        return { selectedIds: next };
      }),
    toggleSelectAll: (checked, ids) => set({ selectedIds: checked ? new Set(ids) : new Set() }),
    clearSelection: () => set({ selectedIds: new Set<string>() }),
    reset: () => set({ filter: initialFilter, selectedIds: new Set<string>() }),
  }));
}
