import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import {
  GroupAssistantItem,
  GroupAssistantListFilter,
} from '@app-types/admin/group-management.types';
import { GroupAssistantsApiService } from '../services/group-assistants-api.service';
import type { AssistantApiItem } from '@app-types/admin/assistant.types';

interface GroupAssistantsState {
  groupId: string;
  items: GroupAssistantItem[];
  totalItems: number;
  filter: GroupAssistantListFilter;
  selectedIds: ReadonlySet<string>;
  isLoading: boolean;
  error: string | null;
}

const initialState: GroupAssistantsState = {
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

function serverLabel(type: string): string {
  switch (type) {
    case 'SECURE':
      return 'ローカル';
    case 'SAAS_RAG':
      return 'クラウド(学習先指定)';
    case 'SAAS_CHAT':
      return 'クラウド(一般)';
    default:
      return type || '—';
  }
}

function formatEndpointLabel(endpoints: AssistantApiItem['endpoints']): string {
  const endpoint = endpoints?.[0];
  if (!endpoint) return '—';
  return endpoint.label || endpoint.model || endpoint.type || '—';
}

function toViewModel(item: AssistantApiItem): GroupAssistantItem {
  return {
    ...item,
    name: item.name ?? item.id,
    historyLabel: item.includeHistory ? 'ON' : 'OFF',
    serverLabel: serverLabel(item.type),
    endpointLabel: formatEndpointLabel(item.endpoints),
  };
}

export const GroupAssistantsStore = signalStore(
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
      return list.length > 0 && list.every((a) => ids.has(a.id));
    }),
    someSelected: computed(() => selectedIds().size > 0),
  })),
  withMethods((store) => {
    const api = inject(GroupAssistantsApiService);

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
      updateFilter: (filter: Partial<GroupAssistantListFilter>) => {
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
          selectedIds: checked ? new Set(store.items().map((a) => a.id)) : new Set<string>(),
        });
      },
      clearSelection: () => patchState(store, { selectedIds: new Set<string>() }),

      removeAssistants: async (assistantIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || assistantIds.length === 0) return;
        await Promise.all(assistantIds.map((id) => api.remove(groupId, id)));
        patchState(store, { selectedIds: new Set<string>() });
        await load();
      },

      addAssistants: async (assistantIds: string[]) => {
        const groupId = store.groupId();
        if (!groupId || assistantIds.length === 0) return;
        await api.addAssistants(groupId, assistantIds);
        await load();
      },
    };
  }),
);
