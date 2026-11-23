import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { fetchLibraryContent } from '@/lib/chat/library-content-api';
import { setLibraryStreamBridge } from '@/lib/chat/library-stream-bridge';
import type { ViewerListItem, ViewerListResponse } from '@/types/chat/viewer.type';

interface ViewerState {
  markdownContent: string;
  isLoading: boolean;
  viewers: ViewerListItem[];
  isLoadingList: boolean;
  listLoadError: boolean;
  contentLoadError: boolean;
  /** loadList が完了した roomId（取得試行済みかの判定に使用） */
  listLoadedRoomId: string | null;
  /** ビューワーに表示中のライブラリ（選択状態の単一ソース） */
  activeLibrary: ViewerListItem | null;
  /** createLibrary 送信中の SSE ストリーミング状態 */
  isLibraryStreaming: boolean;
  streamingLibraryTitle: string;
  streamingRoomId: string | null;
}

interface ViewerActions {
  hasListLoadedFor: (roomId: string) => boolean;
  beginLibraryStream: (roomId: string | null) => number;
  appendLibraryTitleDelta: (token: number, text: string) => void;
  appendLibraryContentDelta: (token: number, text: string) => void;
  endLibraryStream: (token: number, roomId?: string) => Promise<void>;
  abortLibraryStream: (token: number) => Promise<void>;
  selectLibrary: (item: ViewerListItem) => void;
  showLibrary: (library: ViewerListItem) => Promise<void>;
  loadList: (roomId: string, opts?: { autoSelect?: boolean }) => Promise<void>;
  updateLibraryTitle: (libraryId: string, title: string) => void;
  /** テストで状態を初期化する */
  reset: () => void;
}

const INITIAL_STATE: ViewerState = {
  markdownContent: '',
  isLoading: false,
  viewers: [],
  isLoadingList: false,
  listLoadError: false,
  contentLoadError: false,
  listLoadedRoomId: null,
  activeLibrary: null,
  isLibraryStreaming: false,
  streamingLibraryTitle: '',
  streamingRoomId: null,
};

/**
 * 表示中コンテンツの世代トークン。begin/detach/select のたびに進み、
 * 古いストリームの append/end や滞留中の GET 応答を無効化する。
 * 状態ではなく画面に出さない制御値なので、store の外に持つ。
 */
let libraryStreamToken = 0;

/** loadList の世代カウンター。連続ルーム切替時の古いリスト応答を破棄する */
let listRequestToken = 0;

/**
 * 移植元 ViewerService。ビューワーに出すライブラリの一覧・選択・本文と、ライブラリ生成中のストリーミング表示を持つ。
 * 生成中の途中経過は messages-store から `setLibraryStreamBridge` 経由で受ける。
 */
export const useViewerStore = create<ViewerState & ViewerActions>((set, get) => {
  /** ストリームから表示の所有権を剥奪する（以降の append/end は無効になる） */
  const detachLibraryStream = (): void => {
    libraryStreamToken += 1;
    set({ isLibraryStreaming: false, streamingRoomId: null });
  };

  const applyTitleFromContentResponse = (libraryId: string, title: string | undefined): void => {
    const resolvedTitle = title ?? '';
    set((state) => ({
      viewers: state.viewers.map((v) => (v.id === libraryId ? { ...v, title: resolvedTitle } : v)),
      activeLibrary:
        state.activeLibrary?.id === libraryId
          ? { ...state.activeLibrary, title: resolvedTitle }
          : state.activeLibrary,
    }));
  };

  const loadContent = async (libraryId: string | undefined): Promise<void> => {
    if (!libraryId) {
      set({ markdownContent: '' });
      return;
    }

    const tokenAtStart = libraryStreamToken;
    set({ isLoading: true, contentLoadError: false });
    try {
      const response = await fetchLibraryContent(libraryId);
      // GET 滞留中に新しいストリームや選択が始まった場合は古い応答を破棄する
      if (libraryStreamToken !== tokenAtStart) return;
      set({ markdownContent: response.data });
      applyTitleFromContentResponse(libraryId, response.title);
    } catch {
      if (libraryStreamToken === tokenAtStart) {
        set({ markdownContent: '', contentLoadError: true });
      }
    } finally {
      if (libraryStreamToken === tokenAtStart) {
        set({ isLoading: false });
      }
    }
  };

  return {
    ...INITIAL_STATE,

    hasListLoadedFor: (roomId) => get().listLoadedRoomId === roomId,

    beginLibraryStream: (roomId) => {
      libraryStreamToken += 1;
      set({
        streamingRoomId: roomId,
        isLibraryStreaming: true,
        streamingLibraryTitle: '',
        markdownContent: '',
      });
      return libraryStreamToken;
    },

    appendLibraryTitleDelta: (token, text) => {
      if (token !== libraryStreamToken) return;
      set((state) => ({ streamingLibraryTitle: state.streamingLibraryTitle + text }));
    },

    appendLibraryContentDelta: (token, text) => {
      if (token !== libraryStreamToken) return;
      set((state) => ({ markdownContent: state.markdownContent + text }));
    },

    endLibraryStream: async (token, roomId) => {
      if (token !== libraryStreamToken) return;
      // await 前にキャプチャ: 待機中に beginLibraryStream が呼ばれても上書きされない
      // サーバーは永続化時にタイトルを strip するが、ストリーム差分には末尾改行が残るためトリムして照合する
      const title = get().streamingLibraryTitle.trim();
      set({ isLibraryStreaming: false, streamingRoomId: null });
      if (roomId) {
        // ストリーム済み内容を上書きしないよう自動選択は抑止し、タイトル照合で選択状態のみ同期する
        await get().loadList(roomId, { autoSelect: false });
      }
      // roomId の有無に関わらずタイトル照合で選択状態を同期する（null は設定しない）
      const match = get().viewers.find((v) => v.title.trim() === title);
      if (match) {
        set({ activeLibrary: match });
      }
    },

    /** ストリーム失敗時: 表示の所有権を放棄し、選択中ライブラリのサーバー上の内容へ復元する */
    abortLibraryStream: async (token) => {
      if (token !== libraryStreamToken) return;
      detachLibraryStream();
      await loadContent(get().activeLibrary?.id);
    },

    selectLibrary: (item) => {
      if (get().isLibraryStreaming) {
        // ユーザーの明示的な選択が表示の所有権を取る。
        // detachLibraryStream はトークンを +1 するため、ここでは追加インクリメント不要
        detachLibraryStream();
      } else if (get().activeLibrary?.id === item.id) {
        return;
      } else {
        // 非ストリーミング時のみここでトークンを進める（stale-GET ガード）
        libraryStreamToken += 1;
      }
      set({ activeLibrary: item });
      void loadContent(item.id);
    },

    /**
     * 単一ライブラリを指定してその内容をビューワーに表示する。
     * ライブラリ詳細画面（/library/:id）のように、ルームではなく個別ライブラリ ID から直接取得する用途で使う。
     */
    showLibrary: async (library) => {
      // 進行中のストリームや滞留中の GET があれば表示の所有権を剥奪する
      detachLibraryStream();
      set({ viewers: [library], activeLibrary: library });
      await loadContent(library.id);
    },

    loadList: async (roomId, opts = {}) => {
      // 別ルームへの遷移: 旧ルームのストリームは表示の所有権を失う
      if (get().isLibraryStreaming && get().streamingRoomId !== roomId) {
        detachLibraryStream();
      }

      listRequestToken += 1;
      const tokenAtStart = listRequestToken;
      set({ isLoadingList: true, listLoadError: false, contentLoadError: false });
      try {
        const response = await apiClient.get<ViewerListResponse>(
          API_PATHS.VIEWER.DETAIL_LIST(roomId),
        );
        if (listRequestToken !== tokenAtStart) return;
        // backend は title が null の資料も返す。表示とタイトル照合では空文字として扱う
        set({ viewers: response.data.map((item) => ({ id: item.id, title: item.title ?? '' })) });
      } catch {
        if (listRequestToken !== tokenAtStart) return;
        set({ viewers: [], listLoadError: true });
      } finally {
        if (listRequestToken === tokenAtStart) {
          set({ isLoadingList: false, listLoadedRoomId: roomId });
        }
      }

      if (opts.autoSelect === false || get().isLibraryStreaming) return;

      const { viewers: list, activeLibrary: active } = get();
      if (active && list.some((v) => v.id === active.id)) return;

      if (list.length === 0) {
        libraryStreamToken += 1;
        set({ activeLibrary: null, markdownContent: '' });
        return;
      }
      // デフォルトは最新（サーバーは作成日時の昇順で返すため末尾）のライブラリ
      const latest = list[list.length - 1];
      libraryStreamToken += 1;
      set({ activeLibrary: latest });
      void loadContent(latest.id);
    },

    updateLibraryTitle: (libraryId, title) => {
      set((state) => ({
        viewers: state.viewers.map((v) => (v.id === libraryId ? { ...v, title } : v)),
        activeLibrary:
          state.activeLibrary?.id === libraryId ? { ...state.activeLibrary, title } : state.activeLibrary,
      }));
    },

    reset: () => {
      libraryStreamToken += 1;
      listRequestToken += 1;
      set(INITIAL_STATE);
    },
  };
});

// messages-store がライブラリ生成中の途中経過を流す窓口。このモジュールを読み込んだ時点で登録する
setLibraryStreamBridge({
  beginLibraryStream: (roomId) => useViewerStore.getState().beginLibraryStream(roomId),
  appendLibraryTitleDelta: (token, text) =>
    useViewerStore.getState().appendLibraryTitleDelta(token, text),
  appendLibraryContentDelta: (token, text) =>
    useViewerStore.getState().appendLibraryContentDelta(token, text),
  abortLibraryStream: (token) => useViewerStore.getState().abortLibraryStream(token),
  endLibraryStream: (token, roomId) => useViewerStore.getState().endLibraryStream(token, roomId),
});
