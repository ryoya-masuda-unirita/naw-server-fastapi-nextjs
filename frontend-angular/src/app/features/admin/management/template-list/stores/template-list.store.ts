import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AdminTemplate, TemplateApiItem, TemplateFilter } from '@app-types/admin/template.types';
import { TemplateListApiService } from '../services/template-list-api.service';

interface TemplateListState {
  items: AdminTemplate[];
  totalItems: number;
  filter: TemplateFilter;
  selectedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
}

const initialState: TemplateListState = {
  items: [],
  totalItems: 0,
  filter: {
    pageSize: 10,
    pageIndex: 1,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  selectedIds: new Set<string>(),
  isLoading: false,
  error: null,
};

function toViewModel(item: TemplateApiItem): AdminTemplate {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    systemPrompt: item.systemPrompt ?? '',
    teams: item.groups ?? [],
    updatedAt: item.updatedAt,
  };
}

export const TemplateListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ filter, totalItems, items, selectedIds }) => ({
    totalPages: computed(() => Math.max(1, Math.ceil(totalItems() / filter().pageSize))),
    pageRange: computed(() => {
      const f = filter();
      const total = totalItems();
      if (total === 0) return { from: 0, to: 0, total };
      const from = (f.pageIndex - 1) * f.pageSize + 1;
      const to = Math.min(f.pageIndex * f.pageSize, total);
      return { from, to, total };
    }),
    selectedCount: computed(() => selectedIds().size),
    allSelected: computed(() => {
      const ids = selectedIds();
      const list = items();
      return list.length > 0 && list.every((t) => ids.has(t.id));
    }),
    someSelected: computed(() => {
      const ids = selectedIds();
      return ids.size > 0;
    }),
  })),
  withMethods((store) => {
    const api = inject(TemplateListApiService);

    const load = async () => {
      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.list(store.filter());
        patchState(store, {
          items: res.content.map(toViewModel),
          totalItems: res.totalElements,
          isLoading: false,
          // Drop selections that no longer exist on the loaded page
          selectedIds: new Set(
            [...store.selectedIds()].filter((id) => res.content.some((d) => d.id === id)),
          ),
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
      updateFilter: (filter: Partial<TemplateFilter>) => {
        patchState(store, {
          filter: { ...store.filter(), ...filter, pageIndex: 1 },
          selectedIds: new Set<string>(),
        });
        void load();
      },
      updatePageSize: (pageSize: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageSize, pageIndex: 1 },
          selectedIds: new Set<string>(),
        });
        void load();
      },
      updatePageIndex: (pageIndex: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageIndex },
          selectedIds: new Set<string>(),
        });
        void load();
      },
      toggleSelected: (id: string, checked: boolean) => {
        const next = new Set(store.selectedIds());
        if (checked) next.add(id);
        else next.delete(id);
        patchState(store, { selectedIds: next });
      },
      toggleSelectAll: (checked: boolean) => {
        patchState(store, {
          selectedIds: checked ? new Set(store.items().map((t) => t.id)) : new Set<string>(),
        });
      },
      clearSelection: () => patchState(store, { selectedIds: new Set<string>() }),
      removeMany: (ids: string[]) => {
        const idSet = new Set(ids);
        patchState(store, {
          items: store.items().filter((t) => !idSet.has(t.id)),
          totalItems: Math.max(0, store.totalItems() - ids.length),
          selectedIds: new Set<string>(),
        });
      },
      addOne: (template: AdminTemplate) => {
        patchState(store, {
          items: [template, ...store.items()],
          totalItems: store.totalItems() + 1,
        });
      },
      updateOne: (template: AdminTemplate) => {
        patchState(store, {
          items: store.items().map((t) => (t.id === template.id ? template : t)),
        });
      },
    };
  }),
);
