import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SelectOption } from '@app-types/common';
import { buildShareUrl } from '@core/utils/share-url.util';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { SharesService } from '../../services/shares.service';
import { ChatService } from '../../services/chat.service';
import { TeamsService } from '../../services/teams.service';

/** Mutable bridge so `DialogComponent` actions can call into this feature after inputs are wired. */
export interface ChatShareDialogActionBridge {
  runUnshare: () => void;
  runCancel: () => void;
  runShare: () => void;
  confirmDisabled?: WritableSignal<boolean>;
}

@Component({
  selector: 'app-chat-share-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, ComboboxMultiComponent],
  templateUrl: './chat-share-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class ChatShareDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DialogComponent>);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly sharesService = inject(SharesService);
  private readonly chatService = inject(ChatService);
  private readonly teamsService = inject(TeamsService);

  readonly roomId = input<string>('');
  readonly isReadOnly = input<boolean>(false);
  readonly actionBridge = input.required<ChatShareDialogActionBridge>();
  readonly shareId = this.sharesService.shareId;
  readonly isSharing = this.sharesService.isSharing;
  readonly isUnsharing = this.sharesService.isUnsharing;

  readonly selectedTeamIds = signal<string[]>([]);

  readonly roomShareId = computed(() => this.chatService.activeRoom()?.shareId ?? null);

  readonly shareUrl = computed(() => {
    const id = this.roomShareId();
    return id ? buildShareUrl(id) : '';
  });

  readonly showShareLinkActions = computed(() => !!this.roomShareId() && !this.isReadOnly());

  readonly teamsOptions = computed<SelectOption<string>[]>(() =>
    this.teamsService.teams().map((t) => ({ value: t.id, label: t.name })),
  );

  constructor() {
    void this.teamsService.loadTeams();

    effect(() => {
      const b = this.actionBridge();
      b.runUnshare = () => this.openUnshareConfirmDialog();
      b.runCancel = () => this.handleCancel();
      b.runShare = () => this.handleShare();
    });

    effect(() => {
      const hasSelection = this.selectedTeamIds().length > 0;
      this.actionBridge().confirmDisabled?.set(!hasSelection);
    });

    effect(() => {
      const room = this.chatService.activeRoom();
      this.sharesService.shareId.set(room?.shareId ?? null);
      this.selectedTeamIds.set(room?.teamIds ?? []);
    });
  }

  handleCancel(): void {
    this.dialogRef.close(false);
  }

  async handleShare(): Promise<void> {
    const teamIds = this.selectedTeamIds();
    try {
      await this.sharesService.shareRoom(this.roomId(), teamIds);
    } catch {
      this.dialogRef.close(false);
    }
  }

  handleCopyShareLink(): void {
    const url = this.shareUrl();
    if (!url) {
      return;
    }
    void navigator.clipboard.writeText(url);
  }

  openUnshareConfirmDialog(): void {
    const confirmRef = this.dialog.open(DialogComponent, {
      width: '800px',
      maxWidth: '90vw',
      data: {
        title: this.translate.instant('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_TITLE'),
        message: this.translate.instant('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_MESSAGE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('CHAT.SHARE_DIALOG.UNSHARE_CONFIRM_BUTTON'),
        confirmVariant: 'danger',
        confirmDanger: true,
        confirmIcon: 'link_off',
        confirmLoadingSignal: this.sharesService.isUnsharing,
        buttonAlign: 'center',
        showConfirm: true,
        showCancel: true,
      } as DialogData,
    });

    confirmRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        void this.handleUnshare();
      }
    });
  }

  async handleUnshare(): Promise<void> {
    const id = this.roomShareId();
    if (!id) {
      this.dialogRef.close(false);
      return;
    }
    try {
      await this.sharesService.unshareRoom(id);
      this.dialogRef.close({ action: 'unshare', shareId: id, roomId: this.roomId() });
    } catch {
      this.dialogRef.close(false);
    }
  }
}
