import { create } from 'zustand';
import { ASSISTANT_PAGE_SIZE } from '@/components/features/admin/assistants/assistant-list.constants';
import type { AssistantCategoryFilter, AssistantFilter } from '@/types/admin/assistant.types';

/** 移植元 `AssistantListStore` の初期値（1ページ10件・更新日時の降順。`pageIndex` は 0 始まり） */
export const INITIAL_ASSISTANT_FILTER: AssistantFilter = {
  query: '',
  pageIndex: 0,
  pageSize: ASSISTANT_PAGE_SIZE,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

/** 移植元 `AssistantCategoryListStore` の初期値 */
export const INITIAL_CATEGORY_FILTER: AssistantCategoryFilter = {
  query: '',
  pageIndex: 0,
  pageSize: ASSISTANT_PAGE_SIZE,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface AssistantListStore {
  filter: AssistantFilter;
  categoryFilter: AssistantCategoryFilter;
  /** 移植元 `updateFilter`。`pageIndex` を渡さなければ 1 ページ目へ戻す */
  updateFilter: (filter: Partial<AssistantFilter>) => void;
  updateCategoryFilter: (filter: Partial<AssistantCategoryFilter>) => void;
  reset: () => void;
}

/**
 * 移植元 `AssistantListStore`・`AssistantCategoryListStore` のうち画面の状態（絞り込み・並べ替え・ページ）。
 * API から取る一覧は TanStack Query（hooks/use-assistant-list.ts）。
 */
export const useAssistantListStore = create<AssistantListStore>((set) => ({
  filter: INITIAL_ASSISTANT_FILTER,
  categoryFilter: INITIAL_CATEGORY_FILTER,
  updateFilter: (filter) =>
    set((state) => ({
      filter: { ...state.filter, ...filter, pageIndex: filter.pageIndex ?? 0 },
    })),
  updateCategoryFilter: (filter) =>
    set((state) => ({
      categoryFilter: { ...state.categoryFilter, ...filter, pageIndex: filter.pageIndex ?? 0 },
    })),
  reset: () =>
    set({ filter: INITIAL_ASSISTANT_FILTER, categoryFilter: INITIAL_CATEGORY_FILTER }),
}));
