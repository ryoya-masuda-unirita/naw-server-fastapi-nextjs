import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ChatRoom, RoomsListApiResponse } from '@app-types/chat/chat-room.type';
import { API_PATHS } from '@core/constants/api-paths.config';
import { ROUTES } from '@core/constants/routes.config';
import { ApiClientService } from '@core/services/api-client';
import { ChatService } from '@features/chat/services/chat.service';
import { DialogComponent } from '@shared/components/dialog/dialog.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { debounceSignal } from '@shared/utils/debounce-signal';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@core/utils/room-list-mapper.util';

@Component({
  selector: 'app-chat-search-modal',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SearchInputComponent,
    AppMatIconComponent,
    PaginationComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './chat-search-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatSearchModalComponent {
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly api = inject(ApiClientService);

  readonly query = model<string>('');

  readonly results = signal<ChatRoom[]>([]);
  readonly isSearchLoading = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalItems = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));

  private readonly debouncedQuery = debounceSignal(this.query, 300);

  constructor() {
    effect(() => {
      const q = this.debouncedQuery();
      if (q !== '') {
        void this.loadSearchPage(q, 1);
      } else {
        this.results.set([]);
        this.totalItems.set(0);
        this.currentPage.set(1);
      }
    });
  }

  clear(): void {
    this.query.set('');
  }

  onPageChange(page: number): void {
    const q = this.query().trim();
    if (!q) return;
    void this.loadSearchPage(q, page);
  }

  openRoom(room: ChatRoom): void {
    this.chatService.selectRoom(room.id);
    this.dialogRef.close();
    this.router.navigate([ROUTES.APP.CHAT_ROOM(room.id)]);
  }

  formatDay(date: Date | string | undefined): string {
    if (!date) return '';
    try {
      const d = date instanceof Date ? date : new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}/${month}/${day}`;
    } catch {
      return String(date);
    }
  }

  private async loadSearchPage(query: string, page: number): Promise<void> {
    this.isSearchLoading.set(true);
    try {
      const response = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: {
          name: query.trim(),
          page: page - 1,
          size: this.pageSize(),
        },
      });
      const existingById = new Map(this.chatService.allRooms().map((room) => [room.id, room]));
      const rooms = mapRoomListApiResponse(response, existingById);
      const total = getRoomListTotalCount(response);

      this.currentPage.set(page);
      this.results.set(rooms);
      this.totalItems.set(total);
    } catch (error) {
      this.results.set([]);
      this.totalItems.set(0);
      throw error;
    } finally {
      this.isSearchLoading.set(false);
    }
  }
}
