import { computed, inject } from '@angular/core';
import {
  AssistantCategoryApiItem,
  AssistantCategoryFilter,
} from '@app-types/admin/assistant.types';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap } from 'rxjs';
import { AssistantListApiService } from '../services/assistant-list-api.service';

interface AssistantCategoryListState {
  allItems: AssistantCategoryApiItem[];
  items: AssistantCategoryApiItem[];
  totalItems: number;
  isLoading: boolean;
  filter: AssistantCategoryFilter;
}

const initialState: AssistantCategoryListState = {
  allItems: [],
  items: [],
  totalItems: 0,
  isLoading: false,
  filter: { query: '', pageIndex: 0, pageSize: 10, sortField: 'updatedAt', sortOrder: 'desc' },
};

function applyFilter(
  all: AssistantCategoryApiItem[],
  filter: AssistantCategoryFilter,
): AssistantCategoryApiItem[] {
  const { sortField, sortOrder, pageIndex, pageSize } = filter;
  const sorted = [...all].sort((a, b) => {
    const aV = sortField === 'name' ? a.name : a.updatedAt;
    const bV = sortField === 'name' ? b.name : b.updatedAt;
    if (aV === bV) return 0;
    const cmp = aV > bV ? 1 : -1;
    return sortOrder === 'asc' ? cmp : -cmp;
  });
  return sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
}

export const AssistantCategoryListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(AssistantListApiService)) => ({
    loadItems: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true })),
        switchMap(() =>
          api.listCategories().then(
            (res) => {
              patchState(store, {
                allItems: res,
                items: applyFilter(res, store.filter()),
                totalItems: res.length,
                isLoading: false,
              });
            },
            (err) => {
              patchState(store, { isLoading: false });
              console.error('Failed to load assistant categories', err);
            },
          ),
        ),
      ),
    ),

    updateFilter(filter: Partial<AssistantCategoryFilter>) {
      patchState(store, (state) => {
        const newFilter = { ...state.filter, ...filter, pageIndex: filter.pageIndex ?? 0 };
        return {
          filter: newFilter,
          items: applyFilter(state.allItems, newFilter),
        };
      });
    },

    addOne(item: AssistantCategoryApiItem) {
      patchState(store, (state) => {
        const allItems = [item, ...state.allItems];
        return {
          allItems,
          items: applyFilter(allItems, state.filter),
          totalItems: allItems.length,
        };
      });
    },

    removeOne(id: string) {
      patchState(store, (state) => {
        const allItems = state.allItems.filter((item) => item.id !== id);
        return {
          allItems,
          items: applyFilter(allItems, state.filter),
          totalItems: allItems.length,
        };
      });
    },

    removeMany(ids: string[]) {
      patchState(store, (state) => {
        const allItems = state.allItems.filter((item) => !ids.includes(item.id));
        return {
          allItems,
          items: applyFilter(allItems, state.filter),
          totalItems: allItems.length,
        };
      });
    },

    updateOne(id: string, updates: Partial<AssistantCategoryApiItem>) {
      patchState(store, (state) => {
        const allItems = state.allItems.map((item) =>
          item.id === id ? { ...item, ...updates } : item,
        );
        return {
          allItems,
          items: applyFilter(allItems, state.filter),
        };
      });
    },
  })),

  withComputed(({ totalItems, filter }) => ({
    totalPages: computed(() => Math.ceil(totalItems() / filter().pageSize)),
    countDisplay: computed(() => {
      const total = totalItems();
      if (total === 0) return '0件';
      const start = filter().pageIndex * filter().pageSize + 1;
      const end = Math.min((filter().pageIndex + 1) * filter().pageSize, total);
      return `${start}-${end}件 / ${total}件`;
    }),
  })),
);
