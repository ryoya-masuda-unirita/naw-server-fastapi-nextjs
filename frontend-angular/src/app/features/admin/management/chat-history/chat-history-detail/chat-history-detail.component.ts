import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ChatDataPanelComponent } from '@features/chat/components/chat-data-panel/chat-data-panel.component';
import { ChatWindowComponent } from '@features/chat/components/chat-window/chat-window.component';
import { ChatService } from '@features/chat/services/chat.service';
import { LoadingComponent } from '@app/shared/components';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ROUTES } from '@core/constants/routes.config';

interface ChatHistoryDetailState {
  roomName?: string;
  userName?: string;
  userId?: string;
}

@Component({
  selector: 'app-admin-chat-history-detail',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    ChatWindowComponent,
    ChatDataPanelComponent,
    LoadingComponent,
    IconButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './chat-history-detail.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-screen! overflow-hidden bg-white w-full',
  },
})
export class AdminChatHistoryDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly chatService = inject(ChatService);

  readonly roomId = signal<string | null>(null);
  readonly roomName = signal('');
  readonly backRoute = ROUTES.APP.ADMIN_CHAT_HISTORY;

  readonly messages = this.chatService.messages;
  readonly isLoading = this.chatService.isLoading;
  readonly loadError = this.chatService.messagesLoadError;

  readonly displayRoomName = computed(() => this.chatService.activeRoom()?.name || this.roomName());

  readonly showViewer = computed(() => this.messages().some((msg) => msg.role === 'assistant'));

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const roomId = params['roomId'];
      this.roomId.set(roomId ?? null);

      if (!roomId) {
        return;
      }

      const state = this.readNavigationState();
      this.roomName.set(state.roomName ?? '');
      this.chatService.openAdminHistoryRoom({
        id: roomId,
        name: state.roomName ?? '',
        userId: state.userId,
        userName: state.userName,
      });
      void this.chatService.loadMessagesForRoom(roomId, true);
    });
  }

  ngOnDestroy(): void {
    this.chatService.clearAdminHistoryRoomContext();
    this.chatService.startNewChat();
  }

  private readNavigationState(): ChatHistoryDetailState {
    const state = history.state as ChatHistoryDetailState;
    return {
      roomName: state?.roomName,
      userName: state?.userName,
      userId: state?.userId,
    };
  }
}
