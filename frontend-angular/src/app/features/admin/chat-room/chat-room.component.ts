import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
  effect,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ChatDataPanelComponent } from '@features/chat/components/chat-data-panel/chat-data-panel.component';
import { ChatWindowComponent } from '@features/chat/components/chat-window/chat-window.component';
import { ChatService } from '@features/chat/services/chat.service';
import { ViewerService } from '@features/chat/services/viewer.service';
import { LoadingComponent } from '@app/shared/components';

interface PendingMessageState {
  pendingMessage?: {
    content: string;
    files: File[];
    assistantId: string | null;
    useWebSearch?: boolean;
    additionalPrompt?: string;
    createLibrary?: boolean;
  };
}

@Component({
  selector: 'app-admin-chat-room',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    ChatWindowComponent,
    ChatDataPanelComponent,
    LoadingComponent,
  ],
  templateUrl: './chat-room.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-screen! overflow-hidden bg-white w-full',
  },
})
export class AdminChatRoomComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly viewerService = inject(ViewerService);

  readonly roomId = signal<string | null>(null);
  private hasPendingMessage = false;

  readonly messages = this.chatService.messages;
  readonly isLoading = this.chatService.isLoading;

  readonly showViewer = computed(
    () =>
      this.messages().some((msg) => msg.role === 'assistant') ||
      (this.viewerService.isLibraryStreaming() &&
        this.viewerService.streamingRoomId() === this.roomId()),
  );

  constructor() {
    effect(() => {
      const roomId = this.roomId();
      // Only load messages if there's no pending message to send
      if (roomId && !this.hasPendingMessage) {
        void this.chatService.loadMessagesForRoom(roomId, true);
      }
    });
  }

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const roomId = params['roomId'];

      // Check for pending message from navigation state first
      const navigation = this.router.currentNavigation();
      const state = (navigation?.extras?.state ?? window.history.state) as PendingMessageState;

      if (state?.pendingMessage) {
        this.hasPendingMessage = true;
        this.clearPendingMessageState(state);
        const { content, files, assistantId, useWebSearch, additionalPrompt, createLibrary } =
          state.pendingMessage;

        // Set roomId and activeRoomId WITHOUT loading messages
        this.roomId.set(roomId);
        if (roomId) {
          this.chatService.setActiveRoomId(roomId);

          // Send the message immediately without loading old messages first
          void this.chatService
            .sendMessage(content, files, {
              assistantId: assistantId ?? undefined,
              useWebSearch,
              additionalPrompt,
              createLibrary,
            })
            .finally(() => {
              this.hasPendingMessage = false;
            });
        }
      } else {
        // Normal flow: set roomId and let effect load messages
        this.roomId.set(roomId);
        if (roomId) {
          this.chatService.setActiveRoomId(roomId);
        }
      }
    });
  }

  private clearPendingMessageState(state: PendingMessageState): void {
    if (typeof window === 'undefined') return;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pendingMessage: _pendingMessage, ...restState } = window.history.state ?? state;
    window.history.replaceState(restState, document.title, window.location.href);
  }
}
