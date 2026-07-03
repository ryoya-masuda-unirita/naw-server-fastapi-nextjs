/* eslint-disable no-useless-catch */
import { computed, inject, Injectable, signal } from '@angular/core';
import { QueryClient } from '@tanstack/angular-query-experimental';
import {
  ChatRoom,
  RoomsListApiResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  RenameRoomRequest,
  RenameRoomResponse,
  RoomFeedbackRequest,
  RoomFeedbackResponse,
  RoomApiItem,
  RoomListParams,
  RoomListApiItem,
  RoomPinUpdate,
  BulkUpdateRoomPinsRequest,
} from '@app-types/chat/chat-room.type';
import { ApiClientService } from '@core/services/api-client';
import {
  mapRoomListApiItemToChatRoom,
  mapRoomListApiResponse,
} from '@core/utils/room-list-mapper.util';
import { AssistantsService } from './assistants.service';
import { API_PATHS } from '@core/constants/api-paths.config';

interface RoomOrderUpdate {
  id: string;
  isPinned: boolean;
  order: number;
}

@Injectable({
  providedIn: 'root',
})
export class RoomsService {
  private readonly roomPageSize = 20;

  readonly searchResults = signal<ChatRoom[]>([]);
  readonly allRooms = signal<ChatRoom[]>([]);
  readonly isSearchLoading = signal<boolean>(false);
  readonly isAllRoomsLoading = signal<boolean>(false);
  readonly allRoomsHasMore = signal<boolean>(true);
  readonly isCreatingRoom = signal<boolean>(false);
  readonly isRenamingRoom = signal<boolean>(false);
  readonly isDeletingRoom = signal<boolean>(false);
  readonly isReorderingRooms = signal<boolean>(false);
  readonly isSubmittingFeedback = signal<boolean>(false);

  private readonly assistantsService = inject(AssistantsService);
  private readonly api = inject(ApiClientService);
  private readonly queryClient = inject(QueryClient);
  private lastSavedRoomOrder: RoomOrderUpdate[] | null = null;
  private currentRoomsPage = 0;

  pinnedRooms = computed(() => this.allRooms().filter((r) => r.isPinned));
  rooms = this.allRooms.asReadonly();

  updateRoom(roomId: string, partial: Partial<ChatRoom>): void {
    const definedPartial = Object.fromEntries(
      Object.entries(partial).filter(([, value]) => value !== undefined),
    ) as Partial<ChatRoom>;
    const updater = (rooms: ChatRoom[]) =>
      rooms.map((r) => (r.id === roomId ? { ...r, ...definedPartial } : r));
    this.allRooms.update(updater);
    this.searchResults.update(updater);
  }

  async createNewRoom(assistantId: string): Promise<string | null> {
    const assistant = assistantId
      ? (this.assistantsService.assistantsQuery.data() ?? []).find((a) => a.id === assistantId)
      : undefined;
    const body: CreateRoomRequest = {
      name: assistant?.name ?? '',
      assistantId,
    };
    this.isCreatingRoom.set(true);
    try {
      const response = await this.api.post<CreateRoomResponse | RoomListApiItem>(
        API_PATHS.ROOMS.CREATE,
        body,
      );
      const newRoom = this.mapCreateRoomResponse(response, assistantId);
      if (!newRoom.id) {
        return null;
      }
      this.allRooms.update((rooms) => [newRoom, ...rooms.filter((room) => room.id !== newRoom.id)]);
      this.allRoomsHasMore.set(true);
      return newRoom.id;
    } finally {
      this.isCreatingRoom.set(false);
    }
  }

  async renameRoom(roomId: string, newName: string): Promise<void> {
    this.isRenamingRoom.set(true);
    try {
      const response = await this.api.patch<RenameRoomResponse>(API_PATHS.ROOMS.RENAME(roomId), {
        name: newName,
      } satisfies RenameRoomRequest);
      const existing = this.allRooms().find((room) => room.id === roomId);
      this.updateRoom(roomId, this.mapApiRoomToChatRoom(response, existing));
    } finally {
      this.isRenamingRoom.set(false);
    }
  }

  async togglePinRoom(room: { id: string; isPinned: boolean }): Promise<void> {
    const current = this.allRooms().find((r) => r.id === room.id);
    if (room.isPinned) {
      await this.api.delete(API_PATHS.ROOMS.UNPIN(room.id));
      this.applyPinUpdateToLists({
        ...(current ?? { id: room.id, name: '', category: 'chat' as const }),
        isPinned: false,
      });
    } else {
      await this.api.post(API_PATHS.ROOMS.PIN(room.id));
      this.applyPinUpdateToLists({
        ...(current ?? { id: room.id, name: '', category: 'chat' as const }),
        isPinned: true,
      });
    }
  }

  async bulkUpdateRoomPins(rooms: RoomPinUpdate[]): Promise<void> {
    this.isReorderingRooms.set(true);
    try {
      const response = await this.api.put<{ data: ChatRoom[] }>(API_PATHS.ROOMS.BULK_PIN_UPDATE, {
        rooms,
      } satisfies BulkUpdateRoomPinsRequest);
      const updatedRooms = response.data;
      const updatedRoomsById = new Map(updatedRooms.map((room) => [room.id, room]));

      this.lastSavedRoomOrder =
        this.lastSavedRoomOrder?.map((item) => {
          const updated = updatedRoomsById.get(item.id);
          return updated ? { ...item, isPinned: updated.isPinned } : item;
        }) ?? null;

      this.searchResults.update((currentRooms) =>
        updatedRooms.reduce(
          (rooms, updated) => this.applyPinPositionUpdate(rooms, updated, false),
          currentRooms,
        ),
      );
      this.allRooms.update((currentRooms) =>
        updatedRooms.reduce(
          (rooms, updated) => this.applyPinPositionUpdate(rooms, updated),
          currentRooms,
        ),
      );
    } finally {
      this.isReorderingRooms.set(false);
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    this.isDeletingRoom.set(true);
    try {
      await this.api.delete(API_PATHS.ROOMS.DETAIL(roomId));
      this.removeRoomsFromSavedOrder([roomId]);
      this.allRooms.update((rooms) => rooms.filter((r) => r.id !== roomId));
      this.searchResults.update((rooms) => rooms.filter((r) => r.id !== roomId));
    } finally {
      this.isDeletingRoom.set(false);
    }
  }

  async saveRoomOrder(rooms: RoomOrderUpdate[]): Promise<void> {
    this.isReorderingRooms.set(true);
    try {
      const data = await this.api.put<{ data: ChatRoom[] }>(API_PATHS.ROOMS.REORDER, {
        rooms,
      });
      this.lastSavedRoomOrder = rooms;
      this.allRooms.set(this.applyRoomOrder(data.data, rooms));
    } finally {
      this.isReorderingRooms.set(false);
    }
  }

  async deleteRooms(roomIds: string[]): Promise<void> {
    await this.api.delete(API_PATHS.ROOMS.DEFAULT, { body: { ids: roomIds } });
    this.removeRoomsFromSavedOrder(roomIds);
    this.allRooms.update((rooms) => rooms.filter((r) => !roomIds.includes(r.id)));
    this.searchResults.update((rooms) => rooms.filter((r) => !roomIds.includes(r.id)));
  }

  async getAllRooms(): Promise<void> {
    this.currentRoomsPage = 0;
    await this.loadRoomsPage({ page: 0, size: this.roomPageSize }, false);
  }

  async loadNextRoomsPage(): Promise<void> {
    if (this.isAllRoomsLoading() || !this.allRoomsHasMore()) return;
    await this.loadRoomsPage({ page: this.currentRoomsPage + 1, size: this.roomPageSize }, true);
  }

  async submitRoomFeedback(roomId: string, body: RoomFeedbackRequest): Promise<void> {
    this.isSubmittingFeedback.set(true);
    try {
      await this.api.post<RoomFeedbackResponse>(API_PATHS.ROOMS.FEEDBACK(roomId), body);
      this.updateRoom(roomId, { rating: body.rating });
      void this.queryClient.refetchQueries({
        predicate: (query) => isFeedbackListQuery(query.queryKey),
      });
    } catch (error) {
      throw error;
    } finally {
      this.isSubmittingFeedback.set(false);
    }
  }

  async searchRooms(query: string): Promise<void> {
    this.isSearchLoading.set(true);
    try {
      const data = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: query.trim() ? { name: query } : undefined,
      });
      const existingById = new Map(this.allRooms().map((room) => [room.id, room]));
      this.searchResults.set(mapRoomListApiResponse(data, existingById));
    } catch (error) {
      this.searchResults.set([]);
      throw error;
    } finally {
      this.isSearchLoading.set(false);
    }
  }

  private async loadRoomsPage(params: RoomListParams, append: boolean): Promise<void> {
    this.isAllRoomsLoading.set(true);
    try {
      const response = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, { params });
      const existingById = new Map(this.allRooms().map((room) => [room.id, room]));
      const responseRooms = mapRoomListApiResponse(response, existingById);
      const page = response.page ?? response.number ?? params.page ?? 0;
      const pageSize = response.pageSize ?? response.size ?? params.size ?? this.roomPageSize;
      const nextRooms = append
        ? this.mergeRoomsById(this.allRooms(), responseRooms)
        : responseRooms;

      this.currentRoomsPage = page;
      this.allRooms.set(this.applyRoomOrder(nextRooms, this.lastSavedRoomOrder));
      this.allRoomsHasMore.set(
        this.hasMoreRooms(response, responseRooms.length, nextRooms.length, pageSize),
      );
    } catch (error) {
      if (!append) {
        this.allRooms.set([]);
        this.allRoomsHasMore.set(false);
      }
      throw error;
    } finally {
      this.isAllRoomsLoading.set(false);
    }
  }

  private mapApiRoomToChatRoom(api: RoomApiItem, existing?: ChatRoom): ChatRoom {
    return mapRoomListApiItemToChatRoom(api, existing);
  }

  private mapCreateRoomResponse(
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

  private applyPinUpdateToLists(updated: ChatRoom): void {
    this.lastSavedRoomOrder =
      this.lastSavedRoomOrder?.map((item) =>
        item.id === updated.id ? { ...item, isPinned: updated.isPinned } : item,
      ) ?? null;
    this.searchResults.update((rooms) => this.applyPinPositionUpdate(rooms, updated, false));
    this.allRooms.update((rooms) => this.applyPinPositionUpdate(rooms, updated));
  }

  private applyRoomOrder(rooms: ChatRoom[], order: RoomOrderUpdate[] | null): ChatRoom[] {
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

  private mergeRoomsById(currentRooms: ChatRoom[], nextRooms: ChatRoom[]): ChatRoom[] {
    const existingRoomIds = new Set(currentRooms.map((room) => room.id));
    return [...currentRooms, ...nextRooms.filter((room) => !existingRoomIds.has(room.id))];
  }

  private applyPinPositionUpdate(
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

    // ピン解除時は末尾固定ではなく、未ピン一覧の本来の並び (新しい順) に戻す。
    const reorderedUnpinned = [...unpinnedRooms, updatedRoom].sort(
      (a, b) => this.getRoomSortTime(b) - this.getRoomSortTime(a),
    );
    return [...pinnedRooms, ...reorderedUnpinned];
  }

  private getRoomSortTime(room: ChatRoom): number {
    const time = room.lastMessageTime ?? room.updatedAt;
    return time ? new Date(time).getTime() : 0;
  }

  private hasMoreRooms(
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

  private removeRoomsFromSavedOrder(roomIds: string[]): void {
    if (!this.lastSavedRoomOrder) return;

    const removedRoomIds = new Set(roomIds);
    this.lastSavedRoomOrder = this.lastSavedRoomOrder.filter(
      (item) => !removedRoomIds.has(item.id),
    );
  }
}

function isFeedbackListQuery(queryKey: readonly unknown[]): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'feedback' &&
    (queryKey[1] === 'accuracy' || queryKey[1] === 'satisfaction' || queryKey[1] === 'users')
  );
}
