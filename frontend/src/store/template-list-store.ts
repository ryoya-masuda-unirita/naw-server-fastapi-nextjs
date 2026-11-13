import { create } from 'zustand';
import type { TemplateFilter } from '@/types/admin/template.types';

/** 移植元 `TemplateListStore` の初期値（1ページ10件・更新日時の降順） */
export const INITIAL_TEMPLATE_FILTER: TemplateFilter = {
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface TemplateListStore {
  filter: TemplateFilter;
  selectedIds: ReadonlySet<string>;
  /** 検索・絞り込み・並べ替えの変更。1ページ目に戻して選択を解除する */
  updateFilter: (filter: Partial<TemplateFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  toggleSelected: (id: string, checked: boolean) => void;
  toggleSelectAll: (checked: boolean, ids: string[]) => void;
  clearSelection: () => void;
  reset: () => void;
}

/** 移植元 `TemplateListStore` のうち画面の状態（API から取る一覧は TanStack Query） */
export const useTemplateListStore = create<TemplateListStore>((set) => ({
  filter: INITIAL_TEMPLATE_FILTER,
  selectedIds: new Set<string>(),
  updateFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter, pageIndex: 1 },
      selectedIds: new Set<string>(),
    })),
  updatePageIndex: (pageIndex) =>
    set((state) => ({ filter: { ...state.filter, pageIndex }, selectedIds: new Set<string>() })),
  toggleSelected: (id, checked) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (checked) next.add(id);
      else next.delete(id);
      return { selectedIds: next };
    }),
  toggleSelectAll: (checked, ids) => set({ selectedIds: checked ? new Set(ids) : new Set<string>() }),
  clearSelection: () => set({ selectedIds: new Set<string>() }),
  reset: () => set({ filter: INITIAL_TEMPLATE_FILTER, selectedIds: new Set<string>() }),
}));
