import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { UiStore } from '@core/stores/ui.store';
import { ROUTES } from '@core/constants/routes.config';
import { isValidRoomName, normalizeRoomName } from '@core/utils/room-name.helpers';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { ChatHeaderComponent } from '../chat-header/chat-header.component';
import { ChatService } from '../../services/chat.service';
import { AssistantsService } from '../../services/assistants.service';
import {
  ChatRenameDialogComponent,
  ChatRenameDialogActionBridge,
} from '../chat-rename-dialog/chat-rename-dialog.component';
import {
  ChatNewRoomDialogComponent,
  ChatNewRoomDialogActionBridge,
} from '../chat-new-room-dialog/chat-new-room-dialog.component';
import { ChatInputComponent } from '../chat-input/chat-input.component';
import {
  ChatRatingDialogActionBridge,
  ChatRatingDialogComponent,
} from '../chat-rating-dialog/chat-rating-dialog.component';
import {
  ChatShareDialogActionBridge,
  ChatShareDialogComponent,
} from '../chat-share-dialog/chat-share-dialog.component';
import { ChatMessageListComponent } from '../chat-message-list/chat-message-list.component';
import { SharesService } from '../../services/shares.service';
import { RATING_MAP, REVERSE_RATING_MAP } from '../../constants';
import { Message } from '@app-types/chat';
import { ChatAssistantExamComponent } from '../chat-assistant-exam/chat-assistant-exam.component';
import { buildShareUrl } from '@core/utils/share-url.util';
import { ChatSummaryComponent } from '@shared/components/features/chat/chat-summary/chat-summary.component';
import { ViewerService } from '@features/chat/services/viewer.service';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    ChatHeaderComponent,
    ChatMessageListComponent,
    ChatInputComponent,
    ChatAssistantExamComponent,
    ChatSummaryComponent,
  ],
  templateUrl: './chat-window.component.html',

  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'chat-main',
  },
})
export class ChatWindowComponent {
  readonly showHeader = input<boolean>(true);

  private readonly chatService = inject(ChatService);
  private readonly assistantsService = inject(AssistantsService);
  private readonly sharesService = inject(SharesService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly viewerService = inject(ViewerService);
  readonly uiStore = inject(UiStore);
  readonly isReadOnly = input<boolean>();
  readonly roomId = input<string | null>(null);
  readonly showViewer = input<boolean>(false);
  readonly isError = signal<boolean>(false);
  readonly isAlert = signal<boolean>(true);
  readonly isChatExamList = input<boolean>(false);

  readonly shareUrl = computed(() => {
    const shareId = this.activeRoom()?.shareId;
    if (!shareId || typeof window === 'undefined') {
      return '';
    }
    return buildShareUrl(shareId);
  });

  readonly showDataPanel = signal<boolean>(false);
  readonly headerOptions = computed(() => this.viewerService.viewers());
  readonly viewerRoomId = computed(() => this.roomId() ?? this.activeRoom()?.id ?? null);

  readonly activeRoom = this.chatService.activeRoom;
  readonly assistantDescription = computed(() => {
    const room = this.activeRoom();
    if (!room?.defaultAssistantId) return '';
    const assistants = this.assistantsService.assistantsQuery.data() ?? [];
    return assistants.find((a) => a.id === room.defaultAssistantId)?.description ?? '';
  });
  readonly messages = input<Message[]>([]);
  readonly isLoading = input<boolean>(false);

  constructor() {
    effect(() => {
      const isOpen = this.showDataPanel();
      if (typeof window !== 'undefined') {
        if (isOpen) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
        }
      }
    });

    effect(() => {
      const roomId = this.viewerRoomId();
      if (roomId) {
        untracked(() => void this.viewerService.loadList(roomId));
      }
    });

    effect(() => {
      if (!this.uiStore.isMobile() && this.showDataPanel()) {
        this.showDataPanel.set(false);
      }
    });
  }

  async handleSend(data: {
    content: string;
    files: File[];
    assistantId: string | null;
    useWebSearch: boolean;
    additionalPrompt?: string;
    createLibrary: boolean;
  }): Promise<void> {
    let currentRoomId = this.roomId();

    // If no room exists, create a new one first
    if (!currentRoomId) {
      const assistantId = data.assistantId ?? 'default';
      await this.chatService.createNewRoom(assistantId);
      // Get the newly created room ID
      currentRoomId = this.chatService.activeRoomId();

      // Navigate to the new chat room first with message data in state
      if (currentRoomId) {
        // Use setActiveRoomId instead of selectRoom to avoid triggering loadMessagesForRoom
        this.chatService.setActiveRoomId(currentRoomId);
        await this.router.navigate([ROUTES.APP.CHAT_ROOM(currentRoomId)], {
          state: {
            pendingMessage: {
              content: data.content,
              files: data.files,
              assistantId: data.assistantId,
              useWebSearch: data.useWebSearch,
              additionalPrompt: data.additionalPrompt,
              createLibrary: data.createLibrary,
            },
          },
        });

        return; // Exit early, message will be sent in the target component
      }
      return;
    }

    // Send the message directly if room already exists
    await this.chatService.sendMessage(data.content, data.files, {
      assistantId: data.assistantId ?? undefined,
      useWebSearch: data.useWebSearch,
      additionalPrompt: data.additionalPrompt,
      createLibrary: data.createLibrary,
    });
  }

  handleCopy(_messageId: string): void {
    // Clipboard write is handled inside chat-message-item; no server round-trip.
  }

  handleRegenerate(messageId: string): void {
    void this.chatService.regenerateMessage(messageId);
  }

  handleRetry(messageId: string): void {
    void this.chatService.retryMessage(messageId);
  }

  handleEditSubmit({ messageId, newText }: { messageId: string; newText: string }): void {
    void this.chatService.editMessage(messageId, newText);
  }

  handleDelete(messageId: string): void {
    void this.chatService.deleteMessage(messageId);
  }

  handleRate(data: { messageId: string; rating: 'up' | 'down' }): void {
    const apiRating = data.rating === 'up' ? 'GOOD' : 'BAD';
    void this.chatService.rateMessage(data.messageId, apiRating);
  }

  toggleDataPanel(): void {
    this.showDataPanel.update((show) => !show);
  }

  onMobileViewerCollapseChange(collapsed: boolean): void {
    if (collapsed) {
      this.showDataPanel.set(false);
    }
  }

  createNewChat(): void {
    const noop = (): void => {
      void 0;
    };
    const selectedAssistantId: WritableSignal<string | null> = signal<string | null>(null);
    const actionBridge: ChatNewRoomDialogActionBridge = {
      runCancel: noop,
      runCreate: noop,
      selectedAssistantId,
    };

    const dialogRef = this.dialog.open(DialogComponent, {
      width: '480px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('CHAT.WINDOW.CREATE_ROOM_TITLE'),
        showClose: false,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelAction: () => actionBridge.runCancel(),
        confirmAction: () => actionBridge.runCreate(),
        contentComponent: ChatNewRoomDialogComponent,
        contentComponentInputs: { actionBridge },
      } as DialogData,
    });

    actionBridge.runCancel = () => dialogRef.close(null);
    actionBridge.runCreate = () => dialogRef.close(selectedAssistantId());

    dialogRef.afterClosed().subscribe((assistantId: string | null) => {
      if (assistantId !== null) {
        void this.chatService.createNewRoom(assistantId ?? undefined);
      }
    });
  }

  openRenameDialog(): void {
    const activeRoom = this.activeRoom();
    if (!activeRoom) return;

    const name: WritableSignal<string> = signal<string>(activeRoom.name);
    const isRenameDisabled = computed(() => !isValidRoomName(name()));
    const noop = (): void => {
      void 0;
    };
    const actionBridge: ChatRenameDialogActionBridge = {
      runCancel: noop,
      runSave: noop,
      name,
      isLoading: this.chatService.isRenamingRoom,
    };

    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('HEADER.RENAME'),
        showClose: false,
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelAction: () => actionBridge.runCancel(),
        confirmAction: () => actionBridge.runSave(),
        confirmDisabledSignal: isRenameDisabled,
        contentComponent: ChatRenameDialogComponent,
        contentComponentInputs: { actionBridge },
      } as DialogData,
    });

    actionBridge.runCancel = () => dialogRef.close(null);
    actionBridge.runSave = () => {
      if (isRenameDisabled()) return;
      dialogRef.close(normalizeRoomName(name()));
    };

    dialogRef.afterClosed().subscribe((newName: string | null) => {
      if (newName !== null && isValidRoomName(newName) && newName !== activeRoom.name) {
        this.chatService.renameRoom(activeRoom.id, newName);
      }
    });
  }

  openRatingDialog(): void {
    const noop = (): void => {
      void 0;
    };

    const ratingMap = RATING_MAP;
    const reverseRatingMap = REVERSE_RATING_MAP;

    const existingRating = this.activeRoom()?.rating;
    const initialRating: number | null =
      existingRating != null ? (reverseRatingMap[existingRating] ?? null) : null;

    const selectedRating = signal<number | null>(initialRating);
    const actionBridge: ChatRatingDialogActionBridge = {
      runCancel: noop,
      runSubmit: noop,
      selectedRating,
      isLoading: this.chatService.isSubmittingFeedback,
    };

    const dialogRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('CHAT.RATING_DIALOG.TITLE'),
        showClose: false,
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        cancelText: this.translate.instant('CHAT.RATING_DIALOG.CANCEL'),
        confirmText: this.translate.instant('CHAT.RATING_DIALOG.SUBMIT'),
        confirmMinWidth: 'min-w-24.5',
        cancelAction: () => actionBridge.runCancel(),
        confirmAction: () => actionBridge.runSubmit(),
        confirmLoadingSignal: this.chatService.isSubmittingFeedback,
        contentComponent: ChatRatingDialogComponent,
        contentComponentInputs: { actionBridge, initialRating },
      } as DialogData,
    });

    actionBridge.runCancel = () => dialogRef.close(null);
    actionBridge.runSubmit = () => {
      const rating = selectedRating();
      if (rating === null) return;
      const apiRating = ratingMap[rating];
      if (!apiRating) return;
      const roomId = this.activeRoom()?.id;
      if (!roomId) return;

      // Keep the dialog open while the API is in-flight so the loading
      // signal can drive the confirm button's loading state.
      void this.chatService.submitRoomFeedback(roomId, apiRating).then(() => {
        dialogRef.close(rating);
      });
    };
  }

  openShareDialog(): void {
    const roomId = this.activeRoom()?.id ?? '';
    const isReadOnly = this.isReadOnly() ?? false;
    const noop = (): void => {
      void 0;
    };
    const confirmDisabled = signal<boolean>(true);
    const actionBridge: ChatShareDialogActionBridge = {
      runUnshare: noop,
      runCancel: noop,
      runShare: noop,
      confirmDisabled,
    };

    this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      autoFocus: false,
      panelClass: ['share-dialog-container', 'dialog-overflow-visible'],
      data: {
        title: this.translate.instant('CHAT.SHARE_DIALOG.TITLE'),
        showClose: false,
        cancelText: this.translate.instant('CHAT.SHARE_DIALOG.CANCEL'),
        confirmText: this.translate.instant('CHAT.SHARE_DIALOG.SHARE_ACTION'),
        cancelAction: () => actionBridge.runCancel(),
        confirmAction: () => actionBridge.runShare(),
        confirmLoadingSignal: this.sharesService.isSharing,
        confirmDisabledSignal: confirmDisabled,
        contentComponent: ChatShareDialogComponent,
        contentComponentInputs: { roomId, actionBridge, isReadOnly },
        showCancel: true,
        confirmMinWidth: 'min-w-24.5',
        showConfirm: !isReadOnly,
        buttonAlign: 'right' as const,
      } as DialogData,
    });
  }
}
