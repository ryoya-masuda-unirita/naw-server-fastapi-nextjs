import { create } from 'zustand';
import type { ChatHistoryFilter } from '@/types/chat-history.types';

/** 移植元 `ChatHistoryStore` の初期値（1ページ20件・更新日時の降順） */
export const INITIAL_CHAT_HISTORY_FILTER: ChatHistoryFilter = {
  pageSize: 20,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

interface ChatHistoryStore {
  filter: ChatHistoryFilter;
  /** 検索・絞り込み・並べ替えの変更。1ページ目に戻す */
  updateFilter: (filter: Partial<ChatHistoryFilter>) => void;
  updatePageIndex: (pageIndex: number) => void;
  reset: () => void;
}

/** 移植元 `ChatHistoryStore` のうち画面の状態（API から取る一覧は TanStack Query） */
export const useChatHistoryStore = create<ChatHistoryStore>((set) => ({
  filter: INITIAL_CHAT_HISTORY_FILTER,
  updateFilter: (filter) =>
    set((state) => ({ filter: { ...state.filter, ...filter, pageIndex: 1 } })),
  updatePageIndex: (pageIndex) => set((state) => ({ filter: { ...state.filter, pageIndex } })),
  reset: () => set({ filter: INITIAL_CHAT_HISTORY_FILTER }),
}));
