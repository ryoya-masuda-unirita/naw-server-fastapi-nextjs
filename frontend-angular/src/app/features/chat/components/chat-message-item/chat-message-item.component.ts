import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { DropdownService } from '@core/services/dropdown.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MarkdownComponent } from 'ngx-markdown';
import { ChartBlockDirective } from '@shared/directives/chart-block.directive';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { FileChipDocumentComponent } from '@shared/components/file-chip-document/file-chip-document.component';
import { take } from 'rxjs/operators';
import { Message } from '../../../../../types/chat/message.type';
import { MessageVersionInfo } from '@features/chat/utils/message-thread.helpers';
import { FileAttachment } from '../../../../../types/chat/file-attachment.type';
import { getFilePreviewUrl } from '@core/utils/file.helpers';
import { AssistantsService } from '../../services/assistants.service';
import { FileChipComponent } from '@app/shared/components/file';
import { ButtonComponent } from '@app/shared/components';
import { CircularLoadingComponent } from '@app/shared/components/circular-loading/circular-loading.component';
import { ChatMessageFooterComponent } from '../chat-message-footer/chat-message-footer.component';
import { ReferenceComponent } from '../message-item-section/reference/reference.component';
import { MessageErrorSectionComponent } from '../message-item-section/message-error-section/message-error-section.component';
import { ChatReasoningDisplayComponent } from '../chat-reasoning-display/chat-reasoning-display.component';
import { SkeletonComponent } from '@app/shared/components/skeleton/skeleton.component';
@Component({
  selector: 'app-chat-message-item',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    FileChipDocumentComponent,
    FileChipComponent,
    ButtonComponent,
    CircularLoadingComponent,
    ChatMessageFooterComponent,
    ReferenceComponent,
    MessageErrorSectionComponent,
    MarkdownComponent,
    ChartBlockDirective,
    ChatReasoningDisplayComponent,
    SkeletonComponent,
  ],
  templateUrl: './chat-message-item.component.html',
  styleUrl: './chat-message-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class ChatMessageItemComponent {
  private readonly dropdownService = inject(DropdownService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly assistantsService = inject(AssistantsService);
  readonly isReadOnly = input<boolean>();
  readonly getFilePreviewUrl = getFilePreviewUrl;

  readonly message = input.required<Message>();
  readonly isLast = input<boolean>(false);
  readonly versionInfo = input<MessageVersionInfo | null>(null);

  readonly retry = output<string>();
  readonly copyMessage = output<string>();
  readonly regenerate = output<string>();
  readonly delete = output<string>();
  readonly rate = output<{ messageId: string; rating: 'up' | 'down' }>();
  readonly handleSend = output<string>();
  readonly prevVersion = output<void>();
  readonly nextVersion = output<void>();

  readonly isEditing = signal<boolean>(false);
  readonly editText = signal<string>('');
  readonly isSending = signal<boolean>(false);

  private isComposing = false;
  private justFinishedComposing = false;
  readonly isCopied = signal<boolean>(false);
  readonly isMoreMenuOpen = signal<boolean>(false);
  readonly moreMenuStyle = signal<{ bottom: string; right: string }>({
    bottom: '0px',
    right: '0px',
  });

  readonly moreMenuTrigger = viewChild<ElementRef<HTMLButtonElement>>('moreMenuTrigger');

  readonly isUser = computed(() => this.message().role === 'user');
  readonly isAssistant = computed(() => this.message().role === 'assistant');
  readonly isPendingAssistant = computed(
    () =>
      this.isAssistant() && this.message().status === 'PENDING' && !this.message().answer?.trim(),
  );
  readonly hasReasoning = computed(() => (this.message().reasoning?.sections.length ?? 0) > 0);
  readonly hasAttachments = computed(
    () =>
      Number(this.message()?.attachmentFiles?.length) > 0 ||
      Number(this.message()?.files?.length) > 0,
  );

  readonly showPagination = computed(() => (this.versionInfo()?.total ?? 0) > 1);
  readonly versionCurrent = computed(() => this.versionInfo()?.current ?? 1);
  readonly versionTotal = computed(() => this.versionInfo()?.total ?? 1);
  readonly canPrevVersion = computed(() => this.versionInfo()?.canPrev ?? false);
  readonly canNextVersion = computed(() => this.versionInfo()?.canNext ?? false);

  readonly assistantName = computed(() => {
    const id = this.message().assistantId;
    if (!id) return '';
    return (
      (this.assistantsService.assistantsQuery.data() ?? []).find((a) => a.id === id)?.name ?? ''
    );
  });

  // アシスタント一覧の初回読み込み中は、名前が解決できないため
  // 「不明なアシスタント」の代わりにプレースホルダを表示する
  readonly assistantNamePending = computed(
    () =>
      !!this.message().assistantId &&
      !this.assistantName() &&
      this.assistantsService.assistantsQuery.isPending(),
  );

  readonly thumbsUpActive = computed(() => {
    const message = this.message();
    if (message.rating === 'BAD') return false;
    return message.rating === 'GOOD' || message.isRated;
  });

  readonly thumbsDownActive = computed(() => this.message().rating === 'BAD');

  openEdit(): void {
    this.editText.set(this.message().question);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.editText.set('');
  }

  handleEditKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (this.justFinishedComposing) {
        this.justFinishedComposing = false;
        event.preventDefault();
        return;
      }

      if (this.isComposing || event.isComposing) {
        return;
      }

      event.preventDefault();
      this.submitEdit();
    }
  }

  onCompositionStart(): void {
    this.isComposing = true;
    this.justFinishedComposing = false;
  }

  onCompositionEnd(): void {
    this.isComposing = false;
    this.justFinishedComposing = true;

    setTimeout(() => {
      this.justFinishedComposing = false;
    }, 100);
  }

  submitEdit(): void {
    const text = this.editText().trim();
    if (!text || this.isSending()) return;
    this.isSending.set(true);
    this.handleSend.emit(text);
    this.isEditing.set(false);
    this.editText.set('');
    this.isSending.set(false);
  }

  handleCopy(): void {
    const text = this.isUser() ? this.message().question : this.message().answer;
    navigator.clipboard.writeText(text).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
    this.copyMessage.emit(this.message().id);
  }

  handleRegenerate(): void {
    this.regenerate.emit(this.message().id);
  }

  handleRetry(): void {
    this.retry.emit(this.message().id);
  }

  handleDelete(): void {
    const text = this.isUser()
      ? this.message().question
      : this.extractFirstTagText(this.message().answer);
    const body = text.length > 80 ? text.slice(0, 80) + '…' : text;
    const titleKey = this.isUser()
      ? 'CHAT.MESSAGE.DELETE_USER_TITLE'
      : 'CHAT.MESSAGE.DELETE_ASSISTANT_TITLE';

    const data: DialogData = {
      title: this.translate.instant(titleKey),
      message: body,
      confirmText: this.translate.instant('COMMON.DELETE'),
      cancelText: this.translate.instant('COMMON.CANCEL'),
      confirmVariant: 'danger',
      confirmDanger: true,
      buttonAlign: 'center',
      showConfirm: true,
      showCancel: true,
      confirmIcon: 'delete',
    };

    const ref = this.dialog.open(DialogComponent, { data, width: '800px', maxWidth: '90vw' });
    ref
      .afterClosed()
      .pipe(take(1))
      .subscribe((confirmed) => {
        if (confirmed) this.delete.emit(this.message().messageId);
      });
  }

  handleThumbsUp(): void {
    if (this.thumbsUpActive()) return;
    this.rate.emit({ messageId: this.message().messageId, rating: 'up' });
  }

  handleThumbsDown(): void {
    if (this.thumbsDownActive()) return;
    this.rate.emit({ messageId: this.message().messageId, rating: 'down' });
  }

  toggleMoreMenu(): void {
    if (this.isMoreMenuOpen()) {
      this.isMoreMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }
    const btn = this.moreMenuTrigger()?.nativeElement;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const gap = 4;
      this.moreMenuStyle.set({
        bottom: `${window.innerHeight - rect.top + gap}px`,
        right: `${window.innerWidth - rect.right}px`,
      });
    }
    this.isMoreMenuOpen.set(true);

    this.dropdownService.open(() => this.closeMoreMenu());
  }

  closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  saveToLibrary(): void {
    this.isMoreMenuOpen.set(false);
    this.dropdownService.notifyClosed();
  }

  getFileExt(attachment: FileAttachment | File): string {
    return attachment.name.split('.').pop()?.toUpperCase() ?? 'FILE';
  }

  isImageFile(attachment: FileAttachment | File): boolean {
    if (attachment instanceof File) {
      return attachment.type.startsWith('image/');
    }
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    const typeFromField = attachment.type?.toLowerCase() ?? '';
    if (imageTypes.includes(typeFromField)) return true;
    const ext = attachment.name.split('.').pop()?.toLowerCase() ?? '';
    return imageTypes.includes(ext);
  }

  private extractFirstTagText(html: string): string {
    if (!html) return '';
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const first = tmp.firstElementChild;
    return (first?.textContent ?? tmp.textContent ?? '').replace(/\s+/g, ' ').trim();
  }
}
