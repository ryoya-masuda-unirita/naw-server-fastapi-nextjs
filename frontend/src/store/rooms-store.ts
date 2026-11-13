import { create } from 'zustand';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mapRoomListApiItemToChatRoom, mapRoomListApiResponse } from '@/lib/utils/room-list-mapper';
import type { Assistant } from '@/types/chat/assistant.type';
import type {
  BulkUpdateRoomPinsRequest,
  ChatRoom,
  CreateRoomRequest,
  CreateRoomResponse,
  RenameRoomRequest,
  RenameRoomResponse,
  RoomApiItem,
  RoomFeedbackRequest,
  RoomFeedbackResponse,
  RoomListApiItem,
  RoomListParams,
  RoomPinUpdate,
  RoomsListApiResponse,
} from '@/types/chat/chat-room.type';

/**
 * 最新の検索の連番。入力が続いたときに、遅れて届いた前の検索の応答で結果を上書きしないよう、
 * 古い連番の応答は捨てる（移植元にはない）。
 */
let searchSequence = 0;

/** サイドバーのルーム一覧を 1 回に読み込む件数 */
const ROOM_PAGE_SIZE = 20;

export interface RoomOrderUpdate {
  id: string;
  isPinned: boolean;
  order: number;
}

interface RoomsState {
  /** 検索モーダルの結果（移植元 searchResults） */
  searchResults: ChatRoom[];
  /** サイドバーのルーム一覧（移植元 allRooms / rooms） */
  allRooms: ChatRoom[];
  isSearchLoading: boolean;
  isAllRoomsLoading: boolean;
  allRoomsHasMore: boolean;
  isCreatingRoom: boolean;
  isRenamingRoom: boolean;
  isDeletingRoom: boolean;
  isReorderingRooms: boolean;
  isSubmittingFeedback: boolean;
  /** 最後に保存した並び順。一覧を読み直しても並びを保つために使う */
  lastSavedRoomOrder: RoomOrderUpdate[] | null;
  /** 最後に読み込んだページ番号（0 始まり） */
  currentRoomsPage: number;
}

interface RoomsActions {
  updateRoom: (roomId: string, partial: Partial<ChatRoom>) => void;
  /** 新しいルームを作り、その ID を返す。ID が取れなければ null */
  createNewRoom: (assistantId: string, assistants: Assistant[]) => Promise<string | null>;
  renameRoom: (roomId: string, newName: string) => Promise<void>;
  togglePinRoom: (room: { id: string; isPinned: boolean }) => Promise<void>;
  bulkUpdateRoomPins: (rooms: RoomPinUpdate[]) => Promise<void>;
  deleteRoom: (roomId: string) => Promise<void>;
  saveRoomOrder: (rooms: RoomOrderUpdate[]) => Promise<void>;
  deleteRooms: (roomIds: string[]) => Promise<void>;
  getAllRooms: () => Promise<void>;
  loadNextRoomsPage: () => Promise<void>;
  /** 評価を送り、ルームの評価を更新する。フィードバック一覧の再取得は呼び出し側（`useChatActions`）が行う */
  submitRoomFeedback: (roomId: string, body: RoomFeedbackRequest) => Promise<void>;
  searchRooms: (query: string) => Promise<void>;
  reset: () => void;
}

export type RoomsStore = RoomsState & RoomsActions;

const INITIAL_STATE: RoomsState = {
  searchResults: [],
  allRooms: [],
  isSearchLoading: false,
  isAllRoomsLoading: false,
  allRoomsHasMore: true,
  isCreatingRoom: false,
  isRenamingRoom: false,
  isDeletingRoom: false,
  isReorderingRooms: false,
  isSubmittingFeedback: false,
  lastSavedRoomOrder: null,
  currentRoomsPage: 0,
};

/** ピン留めされたルーム（移植元 pinnedRooms） */
export function selectPinnedRooms(state: Pick<RoomsState, 'allRooms'>): ChatRoom[] {
  return state.allRooms.filter((room) => room.isPinned);
}

function applyRoomOrder(rooms: ChatRoom[], order: RoomOrderUpdate[] | null): ChatRoom[] {
  if (!order?.length) return rooms;

  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const orderedRoomIds = new Set(order.map((item) => item.id));
  const orderedRooms = order
    .map((item) => {
      const room = roomsById.get(item.id);
      return room ? { ...room, isPinned: item.isPinned } : null;
    })
    .filter((room): room is ChatRoom => !!room);

  const remainingRooms = rooms.filter((room) => !orderedRoomIds.has(room.id));
  return [...orderedRooms, ...remainingRooms];
}

function mergeRoomsById(currentRooms: ChatRoom[], nextRooms: ChatRoom[]): ChatRoom[] {
  const existingRoomIds = new Set(currentRooms.map((room) => room.id));
  return [...currentRooms, ...nextRooms.filter((room) => !existingRoomIds.has(room.id))];
}

function getRoomSortTime(room: ChatRoom): number {
  const time = room.lastMessageTime ?? room.updatedAt;
  return time ? new Date(time).getTime() : 0;
}

/** ピン留め・解除の結果を一覧へ反映する。ピン留めは末尾のピン群の後ろ、解除は未ピン一覧の本来の並び（新しい順）に戻す */
function applyPinPositionUpdate(
  rooms: ChatRoom[],
  updated: ChatRoom,
  insertIfMissing = true,
): ChatRoom[] {
  const currentRoom = rooms.find((room) => room.id === updated.id);
  if (!currentRoom && !insertIfMissing) return rooms;

  const updatedRoom = currentRoom ? { ...currentRoom, ...updated } : updated;
  const rest = rooms.filter((room) => room.id !== updated.id);
  const pinnedRooms = rest.filter((room) => room.isPinned);
  const unpinnedRooms = rest.filter((room) => !room.isPinned);

  if (updated.isPinned) {
    return [...pinnedRooms, updatedRoom, ...unpinnedRooms];
  }

  const reorderedUnpinned = [...unpinnedRooms, updatedRoom].sort(
    (a, b) => getRoomSortTime(b) - getRoomSortTime(a),
  );
  return [...pinnedRooms, ...reorderedUnpinned];
}

function hasMoreRooms(
  response: RoomsListApiResponse,
  responseCount: number,
  loadedCount: number,
  pageSize: number,
): boolean {
  const total = response.total ?? response.totalElements;
  if (typeof total === 'number') {
    return loadedCount < total;
  }

  return responseCount >= pageSize;
}

/** POST /api/rooms の応答（`{ data }` 包み・平らな RoomResponse・ChatRoom のいずれも）を ChatRoom にする */
function mapCreateRoomResponse(
  response: CreateRoomResponse | RoomListApiItem | ChatRoom,
  assistantId: string,
): ChatRoom {
  const apiItem =
    typeof response === 'object' &&
    response !== null &&
    'data' in response &&
    response.data != null
      ? response.data
      : response;

  if (
    typeof apiItem === 'object' &&
    apiItem !== null &&
    'pinned' in apiItem &&
    typeof apiItem.pinned === 'boolean'
  ) {
    const roomListItem = apiItem as RoomListApiItem;
    return {
      ...mapRoomListApiItemToChatRoom(roomListItem),
      defaultAssistantId: roomListItem.defaultAssistantId ?? assistantId,
    };
  }

  const chatRoom = apiItem as ChatRoom;
  return {
    ...chatRoom,
    defaultAssistantId: chatRoom.defaultAssistantId ?? assistantId,
    category: chatRoom.category ?? 'chat',
    isPinned: chatRoom.isPinned ?? false,
  };
}

/**
 * 移植元 RoomsService（features/chat/services/rooms.service.ts）。サイドバー・検索・チャット画面が共有するルーム一覧の状態と、
 * その API 呼び出し。一覧はページ読み込み・並び替え・楽観的な更新を重ねるため、TanStack Query ではなく store で持つ。
 */
export const useRoomsStore = create<RoomsStore>((set, get) => {
  const setList = (updater: (rooms: ChatRoom[]) => ChatRoom[]) =>
    set((state) => ({ allRooms: updater(state.allRooms) }));
  const setSearch = (updater: (rooms: ChatRoom[]) => ChatRoom[]) =>
    set((state) => ({ searchResults: updater(state.searchResults) }));

  const removeRoomsFromSavedOrder = (roomIds: string[]) => {
    const { lastSavedRoomOrder } = get();
    if (!lastSavedRoomOrder) return;
    const removed = new Set(roomIds);
    set({ lastSavedRoomOrder: lastSavedRoomOrder.filter((item) => !removed.has(item.id)) });
  };

  const applyPinUpdateToLists = (updated: ChatRoom) => {
    set((state) => ({
      lastSavedRoomOrder:
        state.lastSavedRoomOrder?.map((item) =>
          item.id === updated.id ? { ...item, isPinned: updated.isPinned } : item,
        ) ?? null,
    }));
    setSearch((rooms) => applyPinPositionUpdate(rooms, updated, false));
    setList((rooms) => applyPinPositionUpdate(rooms, updated));
  };

  const loadRoomsPage = async (params: RoomListParams, append: boolean) => {
    set({ isAllRoomsLoading: true });
    try {
      const response = await apiClient.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, { params });
      const { allRooms, lastSavedRoomOrder } = get();
      const existingById = new Map(allRooms.map((room) => [room.id, room]));
      const responseRooms = mapRoomListApiResponse(response, existingById);
      const page = response.page ?? response.number ?? params.page ?? 0;
      const pageSize = response.pageSize ?? response.size ?? params.size ?? ROOM_PAGE_SIZE;
      const nextRooms = append ? mergeRoomsById(allRooms, responseRooms) : responseRooms;

      set({
        currentRoomsPage: page,
        allRooms: applyRoomOrder(nextRooms, lastSavedRoomOrder),
        allRoomsHasMore: hasMoreRooms(response, responseRooms.length, nextRooms.length, pageSize),
      });
    } catch (error) {
      if (!append) {
        set({ allRooms: [], allRoomsHasMore: false });
      }
      throw error;
    } finally {
      set({ isAllRoomsLoading: false });
    }
  };

  return {
    ...INITIAL_STATE,

    updateRoom: (roomId, partial) => {
      // undefined は「変更しない」意味なので、既存の値を消さないよう取り除く
      const definedPartial = Object.fromEntries(
        Object.entries(partial).filter(([, value]) => value !== undefined),
      ) as Partial<ChatRoom>;
      const updater = (rooms: ChatRoom[]) =>
        rooms.map((room) => (room.id === roomId ? { ...room, ...definedPartial } : room));
      setList(updater);
      setSearch(updater);
    },

    createNewRoom: async (assistantId, assistants) => {
      const assistant = assistantId ? assistants.find((a) => a.id === assistantId) : undefined;
      const body: CreateRoomRequest = { name: assistant?.name ?? '', assistantId };
      set({ isCreatingRoom: true });
      try {
        const response = await apiClient.post<CreateRoomResponse | RoomListApiItem>(
          API_PATHS.ROOMS.CREATE,
          body,
        );
        const newRoom = mapCreateRoomResponse(response, assistantId);
        if (!newRoom.id) {
          return null;
        }
        setList((rooms) => [newRoom, ...rooms.filter((room) => room.id !== newRoom.id)]);
        set({ allRoomsHasMore: true });
        return newRoom.id;
      } finally {
        set({ isCreatingRoom: false });
      }
    },

    renameRoom: async (roomId, newName) => {
      set({ isRenamingRoom: true });
      try {
        const response = await apiClient.patch<RenameRoomResponse>(API_PATHS.ROOMS.RENAME(roomId), {
          name: newName,
        } satisfies RenameRoomRequest);
        const existing = get().allRooms.find((room) => room.id === roomId);
        get().updateRoom(roomId, mapRoomListApiItemToChatRoom(response as RoomApiItem, existing));
      } finally {
        set({ isRenamingRoom: false });
      }
    },

    togglePinRoom: async (room) => {
      const current = get().allRooms.find((r) => r.id === room.id);
      const base = current ?? { id: room.id, name: '', category: 'chat' as const };
      if (room.isPinned) {
        await apiClient.delete(API_PATHS.ROOMS.UNPIN(room.id));
        applyPinUpdateToLists({ ...base, isPinned: false });
      } else {
        await apiClient.post(API_PATHS.ROOMS.PIN(room.id));
        applyPinUpdateToLists({ ...base, isPinned: true });
      }
    },

    bulkUpdateRoomPins: async (rooms) => {
      set({ isReorderingRooms: true });
      try {
        const response = await apiClient.put<{ data: ChatRoom[] }>(API_PATHS.ROOMS.BULK_PIN_UPDATE, {
          rooms,
        } satisfies BulkUpdateRoomPinsRequest);
        const updatedRooms = response.data;
        const updatedRoomsById = new Map(updatedRooms.map((room) => [room.id, room]));

        set((state) => ({
          lastSavedRoomOrder:
            state.lastSavedRoomOrder?.map((item) => {
              const updated = updatedRoomsById.get(item.id);
              return updated ? { ...item, isPinned: updated.isPinned } : item;
            }) ?? null,
        }));
        setSearch((current) =>
          updatedRooms.reduce((acc, updated) => applyPinPositionUpdate(acc, updated, false), current),
        );
        setList((current) =>
          updatedRooms.reduce((acc, updated) => applyPinPositionUpdate(acc, updated), current),
        );
      } finally {
        set({ isReorderingRooms: false });
      }
    },

    deleteRoom: async (roomId) => {
      set({ isDeletingRoom: true });
      try {
        await apiClient.delete(API_PATHS.ROOMS.DETAIL(roomId));
        removeRoomsFromSavedOrder([roomId]);
        setList((rooms) => rooms.filter((r) => r.id !== roomId));
        setSearch((rooms) => rooms.filter((r) => r.id !== roomId));
      } finally {
        set({ isDeletingRoom: false });
      }
    },

    saveRoomOrder: async (rooms) => {
      set({ isReorderingRooms: true });
      try {
        const data = await apiClient.put<{ data: ChatRoom[] }>(API_PATHS.ROOMS.REORDER, { rooms });
        set({ lastSavedRoomOrder: rooms, allRooms: applyRoomOrder(data.data, rooms) });
      } finally {
        set({ isReorderingRooms: false });
      }
    },

    deleteRooms: async (roomIds) => {
      await apiClient.delete(API_PATHS.ROOMS.DEFAULT, { body: { ids: roomIds } });
      removeRoomsFromSavedOrder(roomIds);
      setList((rooms) => rooms.filter((r) => !roomIds.includes(r.id)));
      setSearch((rooms) => rooms.filter((r) => !roomIds.includes(r.id)));
    },

    getAllRooms: async () => {
      set({ currentRoomsPage: 0 });
      await loadRoomsPage({ page: 0, size: ROOM_PAGE_SIZE }, false);
    },

    loadNextRoomsPage: async () => {
      const { isAllRoomsLoading, allRoomsHasMore, currentRoomsPage } = get();
      if (isAllRoomsLoading || !allRoomsHasMore) return;
      await loadRoomsPage({ page: currentRoomsPage + 1, size: ROOM_PAGE_SIZE }, true);
    },

    submitRoomFeedback: async (roomId, body) => {
      set({ isSubmittingFeedback: true });
      try {
        await apiClient.post<RoomFeedbackResponse>(API_PATHS.ROOMS.FEEDBACK(roomId), body);
        get().updateRoom(roomId, { rating: body.rating });
      } finally {
        set({ isSubmittingFeedback: false });
      }
    },

    searchRooms: async (query) => {
      const sequence = ++searchSequence;
      set({ isSearchLoading: true });
      try {
        const data = await apiClient.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
          params: query.trim() ? { name: query } : undefined,
        });
        if (sequence !== searchSequence) return;
        const existingById = new Map(get().allRooms.map((room) => [room.id, room]));
        set({ searchResults: mapRoomListApiResponse(data, existingById) });
      } catch (error) {
        if (sequence !== searchSequence) return;
        set({ searchResults: [] });
        throw error;
      } finally {
        if (sequence === searchSequence) set({ isSearchLoading: false });
      }
    },

    reset: () => set({ ...INITIAL_STATE }),
  };
});
