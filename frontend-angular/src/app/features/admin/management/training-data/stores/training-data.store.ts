import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import type { UserApiItem } from '@app-types/admin/user.types';
import {
  TrainingDataApiItem,
  TrainingDataFile,
  TrainingDataFileFilter,
  TrainingDataFilter,
  TrainingDataItem,
  TrainingFileUploadEntry,
} from '@app-types/training-data.types';
import { AuthStore } from '@core/stores/auth.store';
import { UserListApiService } from '@features/admin/management/user-list/services/user-list-api.service';
import { TrainingApiService } from '../services/training-api.service';
import {
  DEFAULT_TRAINING_DATA_FILE_FILTER,
  DEFAULT_TRAINING_DATA_FILTER,
} from '../training-data.constants';
import {
  resolveFileUpdatedByNames,
  triggerBlobDownload,
} from '../utils/training-data-files.helper';

interface TrainingDataState {
  items: TrainingDataItem[];
  totalItems: number;
  filter: TrainingDataFilter;
  isLoading: boolean;
  isFilesLoading: boolean;
  selectedItem: TrainingDataApiItem | null;
  files: TrainingDataFile[];
  filesTotalItems: number;
  filesFilter: TrainingDataFileFilter;
  filterUsers: UserApiItem[];
  error: string | null;
}

const initialState: TrainingDataState = {
  items: [],
  totalItems: 0,
  filter: DEFAULT_TRAINING_DATA_FILTER,
  isLoading: false,
  isFilesLoading: false,
  selectedItem: null,
  files: [],
  filesTotalItems: 0,
  filesFilter: DEFAULT_TRAINING_DATA_FILE_FILTER,
  filterUsers: [],
  error: null,
};

function toViewModel(item: TrainingDataApiItem): TrainingDataItem {
  return {
    id: item.id,
    folder: item.name,
    server: item.type === 'SAAS_GLOBAL' ? 'クラウド' : 'ローカル',
    desc: item.description ?? '',
    link: item.type === 'SAAS_GLOBAL' ? 'learningdata-cloud' : 'learningdata-local',
    updatedAt: item.updatedAt,
  };
}

export const TrainingDataStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ filter, totalItems, filesFilter, filesTotalItems }) => ({
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
    filesTotalPages: computed(() => {
      const f = filesFilter();
      return Math.max(1, Math.ceil(filesTotalItems() / f.pageSize));
    }),
    filesPageRange: computed(() => {
      const f = filesFilter();
      const total = filesTotalItems();
      if (total === 0) return { from: 0, to: 0, total };
      const from = (f.pageIndex - 1) * f.pageSize + 1;
      const to = Math.min(f.pageIndex * f.pageSize, total);
      return { from, to, total };
    }),
  })),
  withMethods((store) => {
    const api = inject(TrainingApiService);
    const userApi = inject(UserListApiService);
    const authStore = inject(AuthStore);

    const load = async () => {
      patchState(store, { isLoading: true, error: null });
      try {
        const res = await api.list(store.filter());
        patchState(store, {
          items: res.data.map(toViewModel),
          totalItems: res.total,
          isLoading: false,
        });
      } catch {
        patchState(store, { isLoading: false });
      }
    };

    const loadFilterUsers = async () => {
      try {
        const res = await userApi.list({
          pageSize: 1000,
          pageIndex: 1,
          sortField: 'name',
          sortOrder: 'asc',
        });
        patchState(store, { filterUsers: res.data });
      } catch {
        patchState(store, { filterUsers: [] });
      }
    };

    const loadFilesInternal = async (indexId: string) => {
      patchState(store, { isFilesLoading: true });
      try {
        const res = await api.listFiles(indexId, store.filesFilter(), authStore.user()?.id);
        patchState(store, {
          files: resolveFileUpdatedByNames(res.data, store.filterUsers()),
          filesTotalItems: res.total,
          isFilesLoading: false,
        });
      } catch {
        patchState(store, { isFilesLoading: false });
      }
    };

    return {
      loadItems: load,
      async loadItem(id: string) {
        patchState(store, { isLoading: true });
        try {
          const item = await api.getById(id);
          patchState(store, { selectedItem: item, isLoading: false });
        } catch {
          patchState(store, { isLoading: false });
        }
      },
      async loadDetail(id: string) {
        patchState(store, {
          isLoading: true,
          filesFilter: { ...DEFAULT_TRAINING_DATA_FILE_FILTER },
          files: [],
          filesTotalItems: 0,
          filterUsers: [],
        });
        try {
          const item = await api.getById(id);
          patchState(store, { selectedItem: item, isLoading: false });
          await loadFilterUsers();
          await loadFilesInternal(id);
        } catch {
          patchState(store, { isLoading: false });
        }
      },
      async loadFiles(indexId: string) {
        await loadFilesInternal(indexId);
      },
      updateFilesFilter(
        indexId: string,
        partial: Partial<TrainingDataFileFilter>,
        options?: { resetPage?: boolean },
      ) {
        const current = store.filesFilter();
        const resetPage = options?.resetPage ?? !('pageIndex' in partial);
        patchState(store, {
          filesFilter: {
            ...current,
            ...partial,
            pageIndex: partial.pageIndex ?? (resetPage ? 1 : current.pageIndex),
          },
        });
        void loadFilesInternal(indexId);
      },
      async syncFolder(id: string) {
        patchState(store, { isLoading: true });
        try {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await api.syncFolder(id);
          await this.loadItem(id);
          await loadFilesInternal(id);
        } finally {
          patchState(store, { isLoading: false });
        }
      },
      async addFiles(folderId: string, files: TrainingFileUploadEntry[]) {
        patchState(store, { isFilesLoading: true });
        try {
          await api.addFiles(folderId, files);
          await loadFilesInternal(folderId);
        } finally {
          patchState(store, { isFilesLoading: false });
        }
      },
      async deleteFiles(folderId: string, fileIds: string[]) {
        patchState(store, { isFilesLoading: true });
        try {
          await api.deleteFiles(folderId, fileIds);
          await loadFilesInternal(folderId);
        } finally {
          patchState(store, { isFilesLoading: false });
        }
      },
      async createFolder(data: Partial<TrainingDataApiItem>) {
        patchState(store, { isLoading: true });
        try {
          const newItem = await api.create(data);
          patchState(store, {
            items: [toViewModel(newItem), ...store.items()],
            totalItems: store.totalItems() + 1,
          });
        } finally {
          patchState(store, { isLoading: false });
        }
      },
      async deleteFolder(id: string) {
        patchState(store, { isLoading: true });
        try {
          await api.deleteFolder(id);
          patchState(store, { items: store.items().filter((i) => i.id !== id) });
        } finally {
          patchState(store, { isLoading: false });
        }
      },
      async updateFolder(id: string, data: Partial<TrainingDataApiItem>) {
        patchState(store, { isLoading: true });
        try {
          await api.updateFolder(id, data);
          patchState(store, {
            items: store.items().map((i) =>
              i.id === id
                ? {
                    ...i,
                    folder: data.name ?? i.folder,
                    desc: data.description ?? i.desc,
                    server: data.type
                      ? data.type === 'SAAS_GLOBAL'
                        ? 'クラウド'
                        : 'ローカル'
                      : i.server,
                  }
                : i,
            ),
          });
          await this.loadItem(id);
        } finally {
          patchState(store, { isLoading: false });
        }
      },
      async renameFile(folderId: string, fileId: string, name: string) {
        const previous = store.files();
        patchState(store, {
          files: previous.map((f) => (f.id === fileId ? { ...f, displayName: name } : f)),
        });

        try {
          await api.updateFile(folderId, fileId, { displayName: name });
        } catch {
          patchState(store, { files: previous });
        }
      },
      async toggleFileLearning(
        folderId: string,
        fileId: string,
        currentStatus: 'ENABLE' | 'DISABLE' | 'DELETED',
      ) {
        const nextStatus = currentStatus === 'ENABLE' ? 'DISABLE' : 'ENABLE';
        const previous = store.files();
        patchState(store, {
          files: previous.map((f) => (f.id === fileId ? { ...f, status: nextStatus } : f)),
        });

        try {
          await api.updateFile(folderId, fileId, { status: nextStatus });
        } catch {
          patchState(store, { files: previous });
        }
      },
      async updateFile(
        folderId: string,
        fileId: string,
        data: Partial<TrainingDataFile>,
        uploadFile?: File,
      ) {
        patchState(store, { isFilesLoading: true });
        try {
          await api.updateFile(
            folderId,
            fileId,
            {
              displayName: data.displayName,
              name: data.name,
              splitLength: data.chunkSize,
              reference: data.reference,
              status: data.status,
            },
            uploadFile,
          );
          await loadFilesInternal(folderId);
        } finally {
          patchState(store, { isFilesLoading: false });
        }
      },
      async downloadFile(folderId: string, file: TrainingDataFile) {
        const blob = await api.downloadFile(folderId, file.id);
        triggerBlobDownload(blob, file.name || file.displayName);
      },
      updateFilter: (filter: Partial<TrainingDataFilter>) => {
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
