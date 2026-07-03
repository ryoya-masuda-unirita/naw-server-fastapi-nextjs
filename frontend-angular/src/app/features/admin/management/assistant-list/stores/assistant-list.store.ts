import { computed, inject } from '@angular/core';
import { AssistantApiItem, AssistantFilter } from '@app-types/admin/assistant.types';
import { SelectOption } from '@app-types/common';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { pipe, switchMap, tap } from 'rxjs';
import { ASSISTANT_SERVER_OPTIONS } from '../assistant-list.constants';
import { AssistantListApiService } from '../services/assistant-list-api.service';

interface AssistantListState {
  items: AssistantApiItem[];
  totalItems: number;
  isLoading: boolean;
  filter: AssistantFilter;
  serverOptions: SelectOption[];
  serverApiOptions: Record<string, SelectOption[]>;
  modelOptions: Record<string, Record<string, SelectOption[]>>;
  categoriesOptions: SelectOption[];
  groupOptions: SelectOption[];
  dictionaryOptions: SelectOption[];
  folderOptions: SelectOption[];
}

const initialState: AssistantListState = {
  items: [],
  totalItems: 0,
  isLoading: false,
  filter: {
    query: '',
    pageIndex: 0,
    pageSize: 10,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  serverOptions: ASSISTANT_SERVER_OPTIONS,
  serverApiOptions: {},
  modelOptions: {},
  categoriesOptions: [],
  groupOptions: [],
  dictionaryOptions: [],
  folderOptions: [],
};

export const AssistantListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, api = inject(AssistantListApiService)) => ({
    loadItems: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true })),
        switchMap(() =>
          api.list(store.filter()).then(
            (res) => {
              patchState(store, {
                items: res.content,
                totalItems: res.totalElements,
                isLoading: false,
              });
            },
            (err) => {
              patchState(store, { isLoading: false });
              console.error('Failed to load assistants', err);
            },
          ),
        ),
      ),
    ),

    async loadOptions(): Promise<void> {
      const [categoriesResult, groupsResult, serverApiResult, modelResult, folderResult] =
        await Promise.allSettled([
          api.listCategories(),
          api.getGroupOptions(),
          api.getApiOptions(),
          api.getModelOptions(),
          api.getFolderOptions(),
        ]);

      const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value : [];
      const groupOptions = groupsResult.status === 'fulfilled' ? groupsResult.value : [];
      const serverApiOptions = serverApiResult.status === 'fulfilled' ? serverApiResult.value : {};
      const modelOptions = modelResult.status === 'fulfilled' ? modelResult.value : {};
      const folderOptions = folderResult.status === 'fulfilled' ? folderResult.value : [];

      for (const result of [
        categoriesResult,
        groupsResult,
        serverApiResult,
        modelResult,
        folderResult,
      ]) {
        if (result.status === 'rejected') {
          console.error('Failed to load assistant option', result.reason);
        }
      }

      try {
        const categoriesOptions = [
          { value: 'NONE', label: 'カテゴリなし' },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ];
        const teamOptions = [{ value: 'NONE', label: '所属チームなし' }, ...groupOptions];
        patchState(store, {
          categoriesOptions,
          groupOptions: teamOptions,
          serverApiOptions,
          modelOptions,
          folderOptions,
        });
      } catch (err) {
        console.error('Failed to load assistant options', err);
      }
    },

    updateFilter(filter: Partial<AssistantFilter>) {
      patchState(store, (state) => ({
        filter: { ...state.filter, ...filter, pageIndex: filter.pageIndex ?? 0 },
      }));
      this.loadItems();
    },

    removeOne(id: string) {
      patchState(store, (state) => ({
        items: state.items.filter((item) => item.id !== id),
        totalItems: state.totalItems - 1,
      }));
    },

    addOne(item: AssistantApiItem) {
      patchState(store, (state) => ({
        items: [item, ...state.items],
        totalItems: state.totalItems + 1,
      }));
    },

    removeMany(ids: string[]) {
      patchState(store, (state) => ({
        items: state.items.filter((item) => !ids.includes(item.id)),
        totalItems: state.totalItems - ids.length,
      }));
    },

    updateOne(id: string, updates: Partial<AssistantApiItem>) {
      patchState(store, (state) => ({
        items: state.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      }));
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
