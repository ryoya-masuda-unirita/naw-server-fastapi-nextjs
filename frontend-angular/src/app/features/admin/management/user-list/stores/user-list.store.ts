import { computed, inject } from '@angular/core';
import { AdminUser, UserFilter } from '@app-types/admin/user.types';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { UserListApiService } from '../services/user-list-api.service';
import { UserListAuthService } from '../services/user-list-auth.service';
import { INITIAL_USER_LIST_FILTER } from '../user-list.constants';

interface UserListState {
  items: AdminUser[];
  totalItems: number;
  filter: UserFilter;
  selectedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
}

const initialState: UserListState = {
  items: [],
  totalItems: 0,
  filter: { ...INITIAL_USER_LIST_FILTER },
  selectedIds: new Set<string>(),
  isLoading: false,
  error: null,
};

export const UserListStore = signalStore(
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
    const api = inject(UserListApiService);
    const userListAuth = inject(UserListAuthService);

    const load = async () => {
      const authenticated = await userListAuth.ensureReady();
      if (!authenticated) {
        patchState(store, {
          isLoading: false,
          error: 'unauthenticated',
          items: [],
          totalItems: 0,
        });
        return;
      }

      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.list(store.filter());
        patchState(store, {
          items: res.data.map((item) => ({
            id: item.id,
            userId: item.userId,
            displayName: item.displayName,
            role: item.role,
            totalCredits: item.totalCredits ?? 0,
            loginKey: item.loginKey,
            accountType: item.accountType,
            email: item.email,
            updatedAt: item.updatedAt,
          })),
          totalItems: res.total,
          isLoading: false,
          // Drop selections that no longer exist on the loaded page
          selectedIds: new Set(
            [...store.selectedIds()].filter((id) => res.data.some((d) => d.id === id)),
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
      /** Clears role/search/pagination filters, then reloads (e.g. after create). */
      resetFilterAndLoad: async () => {
        patchState(store, {
          filter: { ...INITIAL_USER_LIST_FILTER },
          selectedIds: new Set<string>(),
        });
        return load();
      },
      updateFilter: (filter: Partial<UserFilter>) => {
        patchState(store, {
          filter: { ...store.filter(), ...filter, pageIndex: 1 },
          selectedIds: new Set<string>(),
        });
        return load();
      },
      updatePageSize: (pageSize: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageSize, pageIndex: 1 },
          selectedIds: new Set<string>(),
        });
        return load();
      },
      updatePageIndex: (pageIndex: number) => {
        patchState(store, {
          filter: { ...store.filter(), pageIndex },
          selectedIds: new Set<string>(),
        });
        return load();
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
      addOne: (user: AdminUser) => {
        patchState(store, {
          items: [user, ...store.items()],
          totalItems: store.totalItems() + 1,
        });
      },
      updateOne: (user: AdminUser) => {
        patchState(store, {
          items: store.items().map((t) => (t.id === user.id ? user : t)),
        });
      },
    };
  }),
);
