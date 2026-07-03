import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { TagItem } from '@app-types/admin/library.types';
import { TagsApiService } from './services/tags-api.service';

interface TagsState {
  items: TagItem[];
  isLoading: boolean;
  totalElements: number;
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortOrder: string;
}

const initialState: TagsState = {
  items: [],
  isLoading: false,
  totalElements: 0,
  currentPage: 1,
  pageSize: 25,
  sortBy: '',
  sortOrder: 'desc',
};

export const TagsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ totalElements, currentPage, pageSize }) => ({
    totalPages: computed(() => Math.ceil(totalElements() / pageSize()) || 1),
    countDisplay: computed(() => {
      const total = totalElements();
      if (total === 0) return '0件';
      const start = (currentPage() - 1) * pageSize() + 1;
      const end = Math.min(currentPage() * pageSize(), total);
      return `${start}-${end}件 / ${total}件`;
    }),
  })),
  withMethods((store) => {
    const api = inject(TagsApiService);

    function sortParam(): string {
      const field = store.sortBy() || 'updatedAt';
      const order = store.sortOrder() || 'desc';
      return `${field},${order}`;
    }

    async function doLoad(): Promise<void> {
      patchState(store, { isLoading: true });
      try {
        const res = await api.list({
          page: store.currentPage() - 1,
          size: store.pageSize(),
          sort: sortParam(),
        });
        patchState(store, {
          items: res.content,
          totalElements: res.totalElements,
          isLoading: false,
        });
      } catch {
        patchState(store, { isLoading: false });
      }
    }

    return {
      loadTags: doLoad,

      async changePage(page: number): Promise<void> {
        patchState(store, { currentPage: page });
        await doLoad();
      },

      async changeSort(sortBy: string): Promise<void> {
        patchState(store, { sortBy, currentPage: 1 });
        await doLoad();
      },

      async changeSortOrder(order: string): Promise<void> {
        patchState(store, { sortOrder: order, currentPage: 1 });
        await doLoad();
      },

      async createTag(payload: { name: string; description?: string }): Promise<boolean> {
        try {
          await api.create(payload);
          patchState(store, { currentPage: 1 });
          await doLoad();
          return true;
        } catch {
          return false;
        }
      },

      async updateTag(
        id: string,
        payload: { name: string; description?: string },
      ): Promise<boolean> {
        try {
          const updated = await api.update(id, payload);
          patchState(store, {
            items: store.items().map((t) => (t.id === updated.id ? updated : t)),
          });
          return true;
        } catch {
          return false;
        }
      },

      async deleteTag(id: string): Promise<void> {
        await api.delete([id]);
        await doLoad();
      },

      async deleteTags(ids: string[]): Promise<void> {
        await api.delete(ids);
        await doLoad();
      },
    };
  }),
);
