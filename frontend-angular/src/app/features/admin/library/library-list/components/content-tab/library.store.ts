import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { AuthStore } from '@core/stores/auth.store';
import {
  LibraryGroupRef,
  LibraryPageItem,
  LibraryTagRef,
  LibraryUpdatePayload,
} from '@app-types/admin/library.types';
import { TagsService } from '@features/chat/services/tags.service';
import { TeamsService } from '@features/chat/services/teams.service';
import { LibraryApiService } from './services/library-api.service';

export type LibraryUserFilterMode = '' | 'mine' | 'others';

interface LibraryState {
  items: LibraryPageItem[];
  isLoading: boolean;
  totalElements: number;
  tagOptions: LibraryTagRef[];
  groupOptions: LibraryGroupRef[];
  filterTitle: string;
  filterUserMode: LibraryUserFilterMode;
  filterTagId: string;
  sortBy: string;
  sortDir: string;
  currentPage: number;
  pageSize: number;
}

const initialState: LibraryState = {
  items: [],
  isLoading: false,
  totalElements: 0,
  tagOptions: [],
  groupOptions: [],
  filterTitle: '',
  filterUserMode: '',
  filterTagId: '',
  sortBy: 'updatedAt',
  sortDir: 'desc',
  currentPage: 1,
  pageSize: 5,
};

export const LibraryStore = signalStore(
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
    const api = inject(LibraryApiService);
    // タグ・共有グループの選択肢は一般ユーザ向けの画面で使うため、利用者向けエンドポイントを扱う
    // 既存サービス（/libraries/tags, /groups）を再利用する
    const tagsService = inject(TagsService);
    const teamsService = inject(TeamsService);
    const authStore = inject(AuthStore);
    // 古いレスポンスがあとから上書きしないよう、最後に発行したリクエストのIDを追跡する
    let loadRequestId = 0;

    async function doLoad(): Promise<void> {
      const requestId = ++loadRequestId;
      patchState(store, { isLoading: true });
      try {
        const mode = store.filterUserMode();
        const loginId = authStore.user()?.id ?? '';

        const res = await api.list({
          page: store.currentPage() - 1,
          size: store.pageSize(),
          title: store.filterTitle() || undefined,
          createdBy: mode === 'mine' ? loginId : undefined,
          excludeCreatedBy: mode === 'others' ? loginId : undefined,
          tagIds: store.filterTagId() ? [store.filterTagId()] : undefined,
          sortBy: store.sortBy(),
          sortDir: store.sortDir(),
        });
        if (requestId !== loadRequestId) return;
        patchState(store, {
          items: res.content,
          totalElements: res.totalElements,
          isLoading: false,
        });
      } catch {
        if (requestId === loadRequestId) {
          patchState(store, { isLoading: false });
        }
      }
    }

    async function loadTagOptions(): Promise<void> {
      // TagsService は失敗時に内部で空配列を設定するため、ここでの try/catch は不要
      await tagsService.loadTags();
      patchState(store, {
        tagOptions: tagsService.tags().map((t) => ({ id: t.id, name: t.name })),
      });
    }

    return {
      async loadLibraries(): Promise<void> {
        await Promise.all([loadTagOptions(), doLoad()]);
      },

      // 共有グループの選択肢は編集ダイアログを開いたときに初めて必要になるため、一覧読み込み時には取得せず、
      // 初回アクセス時にのみ取得してキャッシュする（編集ダイアログを開くたびの再取得を避ける）
      async loadGroupOptions(): Promise<void> {
        if (store.groupOptions().length > 0) return;
        // TeamsService は失敗時に内部で空配列を設定するため、ここでの try/catch は不要
        await teamsService.loadTeams();
        patchState(store, {
          groupOptions: teamsService.teams().map((t) => ({ id: t.id, name: t.name })),
        });
      },

      async changePage(page: number): Promise<void> {
        patchState(store, { currentPage: page });
        await doLoad();
      },

      async changeTitle(title: string): Promise<void> {
        patchState(store, { filterTitle: title, currentPage: 1 });
        await doLoad();
      },

      async changeUserMode(mode: LibraryUserFilterMode): Promise<void> {
        patchState(store, { filterUserMode: mode, currentPage: 1 });
        await doLoad();
      },

      async changeTagFilter(tagId: string): Promise<void> {
        patchState(store, { filterTagId: tagId, currentPage: 1 });
        await doLoad();
      },

      async changeSort(sortBy: string, sortDir: string): Promise<void> {
        patchState(store, { sortBy, sortDir, currentPage: 1 });
        await doLoad();
      },

      // 失敗時はfalseを返し、呼び出し元がダイアログの開閉とユーザ向けトーストを担当する。
      async updateItem(id: string, payload: LibraryUpdatePayload): Promise<boolean> {
        try {
          await api.update(id, payload);
        } catch {
          return false;
        }
        await doLoad();
        return true;
      },

      // 失敗時はfalseを返し、呼び出し元がダイアログの開閉とユーザ向けトーストを担当する。
      async deleteItem(id: string): Promise<boolean> {
        try {
          await api.delete(id);
        } catch {
          return false;
        }
        await doLoad();
        // 最終ページの最後の1件を削除するとcurrentPageが範囲外になるため、最終ページに補正して再ロードする
        if (store.currentPage() > store.totalPages()) {
          patchState(store, { currentPage: store.totalPages() });
          await doLoad();
        }
        return true;
      },
    };
  }),
);
