import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { GroupTemplateListFilter } from '@app-types/admin/group-management.types';
import { GroupTemplatesApiService } from '../services/group-templates-api.service';
import type { TemplateApiItem } from '@app-types/admin/template.types';

interface GroupTemplatesState {
  groupId: string;
  items: TemplateApiItem[];
  totalItems: number;
  filter: GroupTemplateListFilter;
  selectedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
}

const initialState: GroupTemplatesState = {
  groupId: '',
  items: [],
  totalItems: 0,
  filter: {
    pageSize: 25,
    pageIndex: 1,
    sortField: 'addedAt',
    sortOrder: 'desc',
  },
  selectedIds: new Set<string>(),
  isLoading: false,
  error: null,
};

function toViewModel(item: TemplateApiItem): TemplateApiItem {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    systemPrompt: item.systemPrompt ?? '',
    createdAt: item.createdAt ?? item.addedAt ?? item.updatedAt,
    updatedAt: item.updatedAt ?? item.addedAt,
    addedAt: item.addedAt,
  };
}

export const GroupTemplatesStore = signalStore(
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
    someSelected: computed(() => selectedIds().size > 0),
  })),
  withMethods((store) => {
    const api = inject(GroupTemplatesApiService);

    const load = async () => {
      const groupId = store.groupId();
      if (!groupId) return;
      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.listByGroup(groupId, store.filter());
        patchState(store, {
          items: res.content.map(toViewModel),
          totalItems: res.totalElements,
          isLoading: false,
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
      setGroup: (groupId: string) => {
        if (store.groupId() === groupId) return;
        patchState(store, { ...initialState, groupId });
        void load();
      },
      loadItems: load,
      updateFilter: (filter: Partial<GroupTemplateListFilter>) => {
        patchState(store, {
          filter: { ...store.filter(), ...filter, pageIndex: 1 },
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

      removeTemplates: async (templateIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || templateIds.length === 0) return;
        await Promise.all(templateIds.map((id) => api.remove(groupId, id)));
        patchState(store, { selectedIds: new Set<string>() });
        await load();
      },

      addTemplates: async (templateIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || templateIds.length === 0) return;
        await api.addTemplates(groupId, templateIds);
        await load();
      },
    };
  }),
);
