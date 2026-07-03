import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { GroupMemberUserFilter, GroupUserRole } from '@app-types/admin/group-management.types';
import { GroupUsersApiService } from '../services/group-users-api.service';
import { ROLES } from '../group-list.constants';
import type { UserApiItem } from '@app-types/admin/user.types';

interface GroupUsersState {
  groupId: string;
  items: UserApiItem[];
  totalItems: number;
  filter: GroupMemberUserFilter;
  selectedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
}

const initialState: GroupUsersState = {
  groupId: '',
  items: [],
  totalItems: 0,
  filter: {
    query: '',
    pageSize: 25,
    pageIndex: 1,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  },
  selectedIds: new Set<string>(),
  isLoading: false,
  error: null,
};

function toViewModel(item: UserApiItem): UserApiItem {
  return {
    ...item,
    displayName: item.displayName || item.name || item.userId || item.id,
    usedTokens: item.usedTokens ?? null,
    loginKey: item.loginKey ?? '',
    email: item.email ?? '',
    accountType: item.accountType ?? 'none',
    groupAdmin: item.groupAdmin ?? false,
  };
}

export const GroupUsersStore = signalStore(
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
      return list.length > 0 && list.every((u) => ids.has(u.id));
    }),
    someSelected: computed(() => selectedIds().size > 0),
  })),
  withMethods((store) => {
    const api = inject(GroupUsersApiService);

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
      updateFilter: (filter: Partial<GroupMemberUserFilter>) => {
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
          selectedIds: checked ? new Set(store.items().map((u) => u.id)) : new Set<string>(),
        });
      },
      clearSelection: () => patchState(store, { selectedIds: new Set<string>() }),

      updateUserRole: async (userId: string, role: GroupUserRole) => {
        const groupId = store.groupId();
        if (!groupId) return;
        await api.updateRole(groupId, userId, role === ROLES.ADMIN);
        await load();
      },

      removeUsers: async (userIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || userIds.length === 0) return;
        await Promise.all(userIds.map((id) => api.remove(groupId, id)));
        patchState(store, { selectedIds: new Set<string>() });
        await load();
      },

      addUsers: async (userIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || userIds.length === 0) return;
        await api.addUsers(groupId, userIds);
        await load();
      },
    };
  }),
);

export type GroupUsersStoreInstance = InstanceType<typeof GroupUsersStore>;

/** @deprecated use GroupMemberUserFilter role mapping in components */
export const groupRoleToApi = (role: string | 'all'): 'ADMIN' | 'USER' | undefined => {
  if (role === ROLES.ADMIN) return 'ADMIN';
  if (role === ROLES.MEMBER) return 'USER';
  return undefined;
};
