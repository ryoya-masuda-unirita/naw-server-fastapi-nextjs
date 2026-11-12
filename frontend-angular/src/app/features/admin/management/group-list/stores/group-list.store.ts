import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  GroupApiItem,
  GroupListFilter,
  GroupListItem,
} from '@app-types/admin/group-management.types';
import { GroupApiService } from '../services/group-api.service';

interface GroupListState {
  items: GroupListItem[];
  totalItems: number;
  filter: GroupListFilter;
  isLoading: boolean;
  error: string | null;
}

const initialState: GroupListState = {
  items: [],
  totalItems: 0,
  filter: {
    pageSize: 5,
    pageIndex: 1,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  isLoading: false,
  error: null,
};

/**
 * The list endpoint returns ids and optional display names; the cards show names.
 * When `adminUserNames` / `userNames` are present they are used directly; otherwise
 * the page-level resolver converts ids → names using option lists it has fetched.
 */
export function toViewModel(
  item: GroupApiItem,
  resolveNames: (kind: 'user' | 'admin' | 'assistant' | 'template', ids: string[]) => string[],
): GroupListItem {
  const adminUserNames = preferNonEmpty(item.adminUserNames);
  const userNames = preferNonEmpty(item.userNames);
  return {
    id: item.id,
    name: item.name,
    adminUserNames: adminUserNames ?? resolveNames('admin', item.adminUserIds ?? []),
    userNames: userNames ?? resolveNames('user', item.users ?? []),
    assistants: resolveNames('assistant', item.assistantIds ?? item.assistants ?? []),
    templates: resolveNames('template', item.promptTemplateIds ?? item.promptTemplates ?? []),
    updatedAt: item.updatedAt,
  };
}

function preferNonEmpty(values: string[] | undefined): string[] | undefined {
  return values != null && values.length > 0 ? values : undefined;
}

export const GroupListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ filter, totalItems }) => ({
    totalPages: computed(() => Math.max(1, Math.ceil(totalItems() / filter().pageSize))),
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
    const api = inject(GroupApiService);

    type NameResolver = (
      kind: 'user' | 'admin' | 'assistant' | 'template',
      ids: string[],
    ) => string[];

    let resolver: NameResolver = (_kind, ids) => ids;

    const load = async () => {
      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.list(store.filter());
        patchState(store, {
          items: res.data.map((d) => toViewModel(d, resolver)),
          totalItems: res.total,
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
      setNameResolver: (next: NameResolver) => {
        resolver = next;
      },
      loadItems: load,
      updateFilter: (filter: Partial<GroupListFilter>) => {
        patchState(store, { filter: { ...store.filter(), ...filter, pageIndex: 1 } });
        void load();
      },
      updatePageSize: (pageSize: number) => {
        patchState(store, { filter: { ...store.filter(), pageSize, pageIndex: 1 } });
        void load();
      },
      updatePageIndex: (pageIndex: number) => {
        patchState(store, { filter: { ...store.filter(), pageIndex } });
        void load();
      },
      addOne: (item: GroupListItem) => {
        patchState(store, {
          items: [item, ...store.items()],
          totalItems: store.totalItems() + 1,
        });
      },
      updateOne: (item: GroupListItem) => {
        patchState(store, {
          items: store.items().map((i) => (i.id === item.id ? item : i)),
        });
      },
      removeMany: (ids: string[]) => {
        const idSet = new Set(ids);
        patchState(store, {
          items: store.items().filter((i) => !idSet.has(i.id)),
          totalItems: Math.max(0, store.totalItems() - ids.length),
        });
      },
    };
  }),
);
