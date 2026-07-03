import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { Message } from '../../../../../types/chat/message.type';
import { ChatService } from '@features/chat/services/chat.service';
import { MessageVersionInfo } from '@features/chat/utils/message-thread.helpers';
import { ChatMessageItemComponent } from '../chat-message-item/chat-message-item.component';
import { ChatMessageLogoComponent } from '../chat-message-logo/chat-message-logo.component';

@Component({
  selector: 'app-chat-message-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    ChatMessageItemComponent,
    ChatMessageLogoComponent,
  ],
  templateUrl: './chat-message-list.component.html',
  styleUrl: './chat-message-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'display: contents',
  },
})
export class ChatMessageListComponent {
  private readonly chatService = inject(ChatService);

  readonly messages = input.required<Message[]>();
  readonly isLoading = input<boolean>(false);
  readonly isReadOnly = input<boolean>();
  readonly isNewChat = input<boolean>(false);
  readonly assistantDescription = input<string>('');
  readonly isAlert = input<boolean>(false);
  readonly isError = input<boolean>(false);

  readonly versionInfoByMessageId = this.chatService.versionInfoByMessageId;

  readonly versionInfoLookup = computed(() => {
    const lookup = this.versionInfoByMessageId();
    const result = new Map<string, MessageVersionInfo | null>();
    for (const message of this.messages()) {
      const key = message.messageId || message.id;
      result.set(key, lookup.get(key) ?? null);
    }
    return result;
  });

  readonly retry = output<string>();
  readonly copyMessage = output<string>();
  readonly regenerate = output<string>();
  readonly delete = output<string>();
  readonly rate = output<{ messageId: string; rating: 'up' | 'down' }>();
  readonly editSubmit = output<{ messageId: string; newText: string }>();

  readonly scrollContainer = viewChild<ElementRef<HTMLDivElement>>('scrollContainer');

  constructor() {
    effect(() => {
      this.messages();
      this.isLoading();
      setTimeout(() => this.scrollToBottom(), 0);
    });
  }

  private scrollToBottom(): void {
    const el = this.scrollContainer()?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  handleCopy(messageId: string): void {
    this.copyMessage.emit(messageId);
  }

  handleRegenerate(messageId: string): void {
    this.regenerate.emit(messageId);
  }

  handleRetry(messageId: string): void {
    this.retry.emit(messageId);
  }

  handleDelete(messageId: string): void {
    this.delete.emit(messageId);
  }

  handleRate(data: { messageId: string; rating: 'up' | 'down' }): void {
    this.rate.emit(data);
  }

  handleEditSubmit(messageId: string, newText: string): void {
    this.editSubmit.emit({ messageId, newText });
  }

  lookupVersionInfo(message: Message): MessageVersionInfo | null {
    return this.versionInfoLookup().get(message.messageId || message.id) ?? null;
  }

  handlePrevVersion(message: Message): void {
    const info = this.lookupVersionInfo(message);
    if (!info) return;
    this.chatService.switchMessageVersion(info.groupKey, 'prev');
  }

  handleNextVersion(message: Message): void {
    const info = this.lookupVersionInfo(message);
    if (!info) return;
    this.chatService.switchMessageVersion(info.groupKey, 'next');
  }
}
