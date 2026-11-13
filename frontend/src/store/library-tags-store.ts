import { create } from 'zustand';

/** 移植元 `TagsStore` の1ページの件数 */
export const TAGS_PAGE_SIZE = 25;

interface LibraryTagsState {
  /** 空のときは更新日時（API へは `updatedAt,desc` を渡す） */
  sortBy: string;
  sortOrder: string;
  page: number;
}

interface LibraryTagsStore extends LibraryTagsState {
  changePage: (page: number) => void;
  changeSort: (sortBy: string) => void;
  changeSortOrder: (order: string) => void;
  /** 作成後に先頭ページへ戻すために使う */
  goFirstPage: () => void;
  reset: () => void;
}

const INITIAL_STATE: LibraryTagsState = { sortBy: '', sortOrder: 'desc', page: 1 };

/** 移植元 `TagsStore` のうち画面の状態（API から取る一覧は TanStack Query） */
export const useLibraryTagsStore = create<LibraryTagsStore>((set) => ({
  ...INITIAL_STATE,
  changePage: (page) => set({ page }),
  changeSort: (sortBy) => set({ sortBy, page: 1 }),
  changeSortOrder: (sortOrder) => set({ sortOrder, page: 1 }),
  goFirstPage: () => set({ page: 1 }),
  reset: () => set(INITIAL_STATE),
}));
