import { create } from 'zustand';

/** 移植元 `LibraryUserFilterMode` */
export type LibraryUserFilterMode = '' | 'mine' | 'others';

/** 移植元 `LibraryStore` の初期値（1ページ5件・更新日時の降順） */
export const LIBRARY_PAGE_SIZE = 5;
const DEFAULT_SORT_FIELD = 'updatedAt';
const DEFAULT_SORT_ORDER = 'desc';

interface LibraryListState {
  title: string;
  userMode: LibraryUserFilterMode;
  tagId: string;
  /** 並べ替えの選択（クリアで null。API へは null のとき updatedAt を渡す） */
  sortField: string | null;
  sortOrder: string | null;
  page: number;
}

interface LibraryListStore extends LibraryListState {
  changePage: (page: number) => void;
  changeTitle: (title: string) => void;
  changeUserMode: (mode: LibraryUserFilterMode) => void;
  changeTagId: (tagId: string) => void;
  changeSort: (sortField: string | null, sortOrder: string | null) => void;
  reset: () => void;
}

const INITIAL_STATE: LibraryListState = {
  title: '',
  userMode: '',
  tagId: '',
  sortField: DEFAULT_SORT_FIELD,
  sortOrder: DEFAULT_SORT_ORDER,
  page: 1,
};

/**
 * 移植元 `LibraryStore` のうち画面の状態（API から取る一覧は TanStack Query）。
 * 絞り込み・並べ替えを変えたら 1 ページ目へ戻す（移植元と同じ）。
 */
export const useLibraryListStore = create<LibraryListStore>((set) => ({
  ...INITIAL_STATE,
  changePage: (page) => set({ page }),
  changeTitle: (title) => set({ title, page: 1 }),
  changeUserMode: (userMode) => set({ userMode, page: 1 }),
  changeTagId: (tagId) => set({ tagId, page: 1 }),
  changeSort: (sortField, sortOrder) => set({ sortField, sortOrder, page: 1 }),
  reset: () => set(INITIAL_STATE),
}));
