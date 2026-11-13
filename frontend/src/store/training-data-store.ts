import { create } from 'zustand';
import type { TrainingDataFileFilter, TrainingDataFilter } from '@/types/training-data.types';

/** 移植元 `DEFAULT_TRAINING_DATA_FILTER`（1ページ5件・更新日時の降順） */
export const INITIAL_TRAINING_DATA_FILTER: TrainingDataFilter = {
  pageSize: 5,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

/** 移植元 `DEFAULT_TRAINING_DATA_FILE_FILTER`（1ページ10件・更新日時の降順） */
export const INITIAL_TRAINING_DATA_FILE_FILTER: TrainingDataFileFilter = {
  query: '',
  userId: '',
  selectedPeriod: null,
  filterPeriodRange: null,
  selectedStatus: null,
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface TrainingDataStore {
  filter: TrainingDataFilter;
  /** 詳細画面のファイル一覧の条件 */
  filesFilter: TrainingDataFileFilter;
  /** 検索・並べ替えの変更。1ページ目へ戻す */
  updateFilter: (filter: Partial<TrainingDataFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  /** 条件の変更は 1 ページ目へ戻す。ページ送り（`pageIndex` を含む）のときは戻さない（移植元 `updateFilesFilter`） */
  updateFilesFilter: (filter: Partial<TrainingDataFileFilter>) => void;
  reset: () => void;
  resetFilesFilter: () => void;
}

/** 移植元 `TrainingDataStore` のうち画面の状態（API から取る一覧・詳細は TanStack Query） */
export const useTrainingDataStore = create<TrainingDataStore>((set) => ({
  filter: INITIAL_TRAINING_DATA_FILTER,
  filesFilter: INITIAL_TRAINING_DATA_FILE_FILTER,
  updateFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter, pageIndex: 1 } })),
  updatePageIndex: (pageIndex) => set((state) => ({ filter: { ...state.filter, pageIndex } })),
  updateFilesFilter: (filter) =>
    set((state) => ({
      filesFilter: {
        ...state.filesFilter,
        ...filter,
        pageIndex: filter.pageIndex ?? 1,
      },
    })),
  reset: () => set({ filter: INITIAL_TRAINING_DATA_FILTER }),
  resetFilesFilter: () => set({ filesFilter: INITIAL_TRAINING_DATA_FILE_FILTER }),
}));
