import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  ChatHistoryApiItem,
  ChatHistoryFilter,
  ChatHistoryItem,
} from '@app-types/chat-history.types';
import { ChatHistoryApiService } from '../services/chat-history-api.service';

interface ChatHistoryState {
  items: ChatHistoryItem[];
  totalItems: number;
  filter: ChatHistoryFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: ChatHistoryState = {
  items: [],
  totalItems: 0,
  filter: {
    pageSize: 20,
    pageIndex: 1,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  isLoading: false,
  error: null,
};

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toViewModel(item: ChatHistoryApiItem): ChatHistoryItem {
  return {
    id: item.id,
    date: formatDate(item.updatedAt),
    userId: item.userId ?? '',
    userName: item.userName ?? '',
    roomName: item.name,
    description: item.description,
  };
}

export const ChatHistoryStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ filter, totalItems }) => ({
    totalPages: computed(() => {
      const f = filter();
      return Math.max(1, Math.ceil(totalItems() / f.pageSize));
    }),
    pageRange: computed(() => {
      const f = filter();
      const total = totalItems();
      if (total === 0) return { from: 0, to: 0, total };
      const from = (f.pageIndex - 1) * f.pageSize + 1;
      const to = Math.min(f.pageIndex * f.pageSize, total);
      return { from, to, total };
    }),
  })),
  withMethods((store) => {
    const api = inject(ChatHistoryApiService);

    const load = async () => {
      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.list(store.filter());
        patchState(store, {
          items: res.content.map(toViewModel),
          totalItems: res.totalElements,
          isLoading: false,
        });
      } catch (err) {
        patchState(store, {
          isLoading: false,
          error: err instanceof Error ? err.message : 'unknown',
          items: [],
          totalItems: 0,
        });
      }
    };

    return {
      loadItems: load,
      updateFilter: (filter: Partial<ChatHistoryFilter>) => {
        patchState(store, {
          filter: { ...store.filter(), ...filter, pageIndex: 1 },
        });
        void load();
      },
      updatePageSize: (pageSize: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageSize, pageIndex: 1 },
        });
        void load();
      },
      updatePageIndex: (pageIndex: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageIndex },
        });
        void load();
      },
    };
  }),
);
