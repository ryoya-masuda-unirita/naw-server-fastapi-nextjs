import { create } from 'zustand';
import type { TrainingDataFilter } from '@/types/training-data.types';

/** 移植元 `DEFAULT_TRAINING_DATA_FILTER`（1ページ5件・更新日時の降順） */
export const INITIAL_TRAINING_DATA_FILTER: TrainingDataFilter = {
  pageSize: 5,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface TrainingDataStore {
  filter: TrainingDataFilter;
  /** 検索・並べ替えの変更。1ページ目へ戻す */
  updateFilter: (filter: Partial<TrainingDataFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  reset: () => void;
}

/** 移植元 `TrainingDataStore` のうち一覧画面の状態（API から取る一覧は TanStack Query） */
export const useTrainingDataStore = create<TrainingDataStore>((set) => ({
  filter: INITIAL_TRAINING_DATA_FILTER,
  updateFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter, pageIndex: 1 } })),
  updatePageIndex: (pageIndex) => set((state) => ({ filter: { ...state.filter, pageIndex } })),
  reset: () => set({ filter: INITIAL_TRAINING_DATA_FILTER }),
}));
