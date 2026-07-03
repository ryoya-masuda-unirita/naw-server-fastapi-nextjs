import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import { MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { DialogComponent } from '@shared/components/dialog/dialog.component';
import { SkeletonComponent } from '@shared/components/skeleton/skeleton.component';
import { SkeletonBlockComponent } from '@shared/components/skeleton/skeleton-block.component';
import { ChatService } from '@features/chat/services/chat.service';
import { SvgIconComponent } from '@app/shared/components';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ChatRoom, RoomPinUpdate, RoomsListApiResponse } from '@app-types/chat/chat-room.type';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@core/utils/room-list-mapper.util';

export interface SortableRoom {
  id: string;
  title: string;
  isPinned: boolean;
}

export interface ChatSortDialogActionBridge {
  runCancel?: () => void;
  runSave?: () => void;
}

@Component({
  selector: 'app-chat-sort-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0' },
  imports: [
    TranslateModule,
    SkeletonComponent,
    SkeletonBlockComponent,
    SvgIconComponent,
    PaginationComponent,
  ],
  templateUrl: './chat-sort-dialog.component.html',
})
export class ChatSortDialogComponent {
  private readonly pinnedRoomsPageSize = 1000;

  private readonly chatService = inject(ChatService);
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly api = inject(ApiClientService);
  private readonly initialPinStates = new Map<string, boolean>();
  private readonly pendingRooms = new Map<string, SortableRoom>();

  readonly isSearchLoading = signal(false);
  readonly isReorderingRooms = this.chatService.isReorderingRooms;
  readonly pinnedRooms = signal<SortableRoom[]>([]);
  readonly unpinnedRooms = signal<SortableRoom[]>([]);
  readonly pendingPinUpdates = signal<RoomPinUpdate[]>([]);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly totalItems = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  readonly actionBridge = input<ChatSortDialogActionBridge | null>(null);

  constructor() {
    effect(() => {
      const bridge = this.actionBridge();
      if (!bridge) return;
      bridge.runCancel = () => this.cancel();
      bridge.runSave = () => this.save();
    });

    void this.loadRoomsPage(1);
  }

  onPageChange(page: number): void {
    void this.loadUnpinnedRoomsPage(page);
  }

  togglePin(room: SortableRoom): void {
    const nextIsPinned = !room.isPinned;
    const nextRoom = { ...room, isPinned: nextIsPinned };
    this.pendingRooms.set(room.id, nextRoom);

    this.pendingPinUpdates.update((updates) => {
      const initialState = this.initialPinStates.get(room.id);

      if (initialState === nextIsPinned) {
        this.pendingRooms.delete(room.id);
        return updates.filter((update) => update.roomId !== room.id);
      }

      const nextUpdate = { roomId: room.id, isPinned: nextIsPinned };
      if (updates.some((update) => update.roomId === room.id)) {
        return updates.map((update) => (update.roomId === room.id ? nextUpdate : update));
      }
      return [...updates, nextUpdate];
    });

    if (nextIsPinned) {
      this.unpinnedRooms.update((list) => list.filter((r) => r.id !== room.id));
      this.pinnedRooms.update((list) => this.upsertRoom(list, nextRoom));
    } else {
      this.pinnedRooms.update((list) => list.filter((r) => r.id !== room.id));
      this.unpinnedRooms.update((list) => this.upsertRoom(list, nextRoom));
    }
  }

  save(): void {
    const payload = this.pendingPinUpdates();

    this.chatService
      .bulkUpdateRoomPins(payload)
      .then(() => this.dialogRef.close(payload))
      .catch(() => {
        /* keep dialog open on error */
      });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }

  private async loadRoomsPage(page: number): Promise<void> {
    this.isSearchLoading.set(true);

    try {
      await Promise.all([this.loadPinnedRooms(), this.loadUnpinnedRoomsPage(page, false)]);
    } catch (error) {
      this.pinnedRooms.set([]);
      this.unpinnedRooms.set([]);
      this.totalItems.set(0);
      throw error;
    } finally {
      this.isSearchLoading.set(false);
    }
  }

  private async loadPinnedRooms(): Promise<void> {
    const response = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
      params: {
        isPinned: true,
        page: 0,
        size: this.pinnedRoomsPageSize,
      },
    });
    const rooms = mapRoomListApiResponse(response);
    const pinnedRooms = rooms.map((room) => this.toSortableRoom(room, true));

    this.rememberInitialPinStates(pinnedRooms);
    this.pinnedRooms.set(this.applyPendingPinStates(pinnedRooms, true));
  }

  private async loadUnpinnedRoomsPage(page: number, updateLoading = true): Promise<void> {
    if (updateLoading) {
      this.isSearchLoading.set(true);
    }

    try {
      const response = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: {
          isPinned: false,
          page: page - 1,
          size: this.pageSize(),
        },
      });
      const rooms = mapRoomListApiResponse(response);
      const unpinnedRooms = rooms.map((room) => this.toSortableRoom(room, false));
      const total = getRoomListTotalCount(response);

      this.rememberInitialPinStates(unpinnedRooms);
      this.currentPage.set(page);
      this.unpinnedRooms.set(this.applyPendingPinStates(unpinnedRooms, false));
      this.totalItems.set(total);
    } catch (error) {
      this.unpinnedRooms.set([]);
      this.totalItems.set(0);
      throw error;
    } finally {
      if (updateLoading) {
        this.isSearchLoading.set(false);
      }
    }
  }

  private toSortableRoom(room: ChatRoom, isPinned: boolean): SortableRoom {
    return {
      id: room.id,
      title: room.name,
      isPinned,
    };
  }

  private rememberInitialPinStates(rooms: SortableRoom[]): void {
    for (const room of rooms) {
      if (!this.initialPinStates.has(room.id)) {
        this.initialPinStates.set(room.id, room.isPinned);
      }
    }
  }

  private applyPendingPinStates(rooms: SortableRoom[], targetIsPinned: boolean): SortableRoom[] {
    const pendingStates = new Map(
      this.pendingPinUpdates().map((update) => [update.roomId, update.isPinned]),
    );
    const roomIds = new Set(rooms.map((room) => room.id));
    const visibleRooms = rooms
      .map((room) => ({ ...room, isPinned: pendingStates.get(room.id) ?? room.isPinned }))
      .filter((room) => room.isPinned === targetIsPinned);

    for (const [id, isPinned] of pendingStates) {
      const room = this.pendingRooms.get(id);
      if (!room || isPinned !== targetIsPinned || roomIds.has(id)) continue;
      visibleRooms.push({ ...room, isPinned });
    }

    return visibleRooms;
  }

  private upsertRoom(rooms: SortableRoom[], room: SortableRoom): SortableRoom[] {
    if (rooms.some((r) => r.id === room.id)) {
      return rooms.map((r) => (r.id === room.id ? room : r));
    }

    return [...rooms, room];
  }
}
