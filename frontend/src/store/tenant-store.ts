import { create } from 'zustand';

interface TenantUsageStore {
  /** 並べ替え項目（`updated`・`amount`。null は既定の利用日時の新しい順） */
  sortField: string | null;
  sortOrder: string | null;
  /** 1 始まり */
  page: number;
  /** 絞り込む利用者の `users.id`（空文字は全員） */
  userFilter: string;
  /** 並べ替えを変えたら 1 ページ目に戻す（移植元 usage-tab の effect） */
  setSort: (field: string | null, order: string | null) => void;
  setPage: (page: number) => void;
  setUserFilter: (userId: string) => void;
  reset: () => void;
}

const INITIAL_STATE = { sortField: null, sortOrder: null, page: 1, userFilter: '' };

/** 移植元 TenantApiService の usageSortField・usageSortOrder・usagePage・usageUserFilter（利用履歴の条件） */
export const useTenantUsageStore = create<TenantUsageStore>((set) => ({
  ...INITIAL_STATE,
  setSort: (sortField, sortOrder) => set({ sortField, sortOrder, page: 1 }),
  setPage: (page) => set({ page }),
  setUserFilter: (userFilter) => set({ userFilter, page: 1 }),
  reset: () => set(INITIAL_STATE),
}));
