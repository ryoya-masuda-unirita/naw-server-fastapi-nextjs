import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
  TemplateRef,
  WritableSignal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { TableComponent } from '@shared/components/table/table.component';
import { TableColumn } from '@shared/components/table/table.interface';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { ChatService } from '@features/chat/services/chat.service';
import { ChatRoom, RoomsListApiResponse } from '@app-types/chat/chat-room.type';
import { ApiClientService } from '@core/services/api-client';
import { API_PATHS } from '@core/constants/api-paths.config';
import { CircularLoadingComponent } from '@app/shared/components/circular-loading/circular-loading.component';
import { getRoomListTotalCount, mapRoomListApiResponse } from '@core/utils/room-list-mapper.util';

export interface ChatDeleteDialogActionBridge {
  selectedCount: WritableSignal<number>;
  runCancel?: () => void;
  runDelete?: () => void;
}

@Component({
  selector: 'app-chat-delete-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col' },
  imports: [
    CommonModule,
    TranslateModule,
    TableComponent,
    PaginationComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './chat-delete-dialog.component.html',
})
export class ChatDeleteDialogComponent {
  private readonly chatService = inject(ChatService);
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateService = inject(TranslateService);
  private readonly api = inject(ApiClientService);

  readonly isOpenConfirm = signal(false);
  readonly rooms = signal<ChatRoom[]>([]);
  readonly isLoading = signal(false);
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);
  readonly totalItems = signal(0);
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalItems() / this.pageSize())));
  readonly selectedRooms = signal<ChatRoom[]>([]);
  readonly selectedCount = computed(() => this.selectedRooms().length);
  readonly actionBridge = input<ChatDeleteDialogActionBridge | null>(null);

  readonly dateColTpl = viewChild.required<TemplateRef<unknown>>('dateColTpl');
  readonly nameColTpl = viewChild.required<TemplateRef<unknown>>('nameColTpl');
  readonly mobileRowTpl = viewChild.required<TemplateRef<unknown>>('mobileRowTplDef');

  readonly columns = computed<TableColumn[]>(() => [
    {
      field: 'lastMessageTime',
      header: 'SIDEBAR.DELETE_DIALOG.DATE',
      width: '120px',
      template: this.dateColTpl(),
    },
    {
      field: 'name',
      header: 'SIDEBAR.DELETE_DIALOG.CHAT_NAME',
      template: this.nameColTpl(),
    },
  ]);

  constructor() {
    effect(() => {
      const bridge = this.actionBridge();
      if (!bridge) return;
      bridge.runCancel = () => this.onCancel();
      bridge.runDelete = () => this.openDeleteDialog();
    });

    void this.loadRoomsPage(1);
  }

  onSelectionChange(selected: ChatRoom[]): void {
    this.selectedRooms.set(selected);
    this.actionBridge()?.selectedCount.set(selected.length);
  }

  onPageChange(page: number): void {
    void this.loadRoomsPage(page);
  }

  formatDate(date?: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}/${m}/${day}`;
  }

  onCancel(): void {
    this.dialogRef.close(null);
  }

  openDeleteDialog(): void {
    const dialogData: DialogData = {
      title: this.translateService.instant('SIDEBAR.DELETE_DIALOG.CONFIRM_TITLE'),
      message: this.translateService.instant('SIDEBAR.DELETE_DIALOG.CONFIRM_DESC'),
      cancelText: this.translateService.instant('COMMON.CANCEL'),
      confirmText: this.translateService.instant('COMMON.DELETE'),
      showCancel: true,
      showConfirm: true,
      confirmDanger: true,
      confirmIcon: 'delete',
      confirmLoading: false,
      buttonAlign: 'center',
    };

    const confirmRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: dialogData,
    });

    dialogData.confirmAction = () => {
      dialogData.confirmLoading = true;
      confirmRef.componentRef?.changeDetectorRef.markForCheck();

      this.onDelete()
        .then(() => confirmRef.close(true))
        .catch(() => {
          dialogData.confirmLoading = false;
          confirmRef.componentRef?.changeDetectorRef.markForCheck();
        });
    };

    dialogData.cancelAction = () => confirmRef.close(false);

    confirmRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (confirmed) {
          this.dialogRef.close(this.selectedRooms().map((r) => r.id));
        }
      });
  }

  onDelete(): Promise<void> {
    const ids = this.selectedRooms().map((r) => r.id);
    return this.chatService.deleteRooms(ids);
  }

  private async loadRoomsPage(page: number): Promise<void> {
    this.isLoading.set(true);
    this.selectedRooms.set([]);
    this.actionBridge()?.selectedCount.set(0);

    try {
      const response = await this.api.get<RoomsListApiResponse>(API_PATHS.ROOMS.LIST, {
        params: {
          page: page - 1,
          size: this.pageSize(),
        },
      });
      const existingById = new Map(this.chatService.allRooms().map((room) => [room.id, room]));
      const rooms = mapRoomListApiResponse(response, existingById);
      const total = getRoomListTotalCount(response);

      this.currentPage.set(page);
      this.rooms.set(rooms);
      this.totalItems.set(total);
    } catch (error) {
      this.rooms.set([]);
      this.totalItems.set(0);
      throw error;
    } finally {
      this.isLoading.set(false);
    }
  }
}
