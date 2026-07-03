import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ROUTES } from '@core/constants/routes.config';
import { LoadingComponent } from '@shared/components';
import { ChatDataPanelComponent } from '../../components/chat-data-panel/chat-data-panel.component';
import { ChatWindowComponent } from '../../components/chat-window/chat-window.component';
import { ChatService } from '../../services/chat.service';
import { SharesService } from '../../services/shares.service';

@Component({
  selector: 'app-chat-shared',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatIconModule,
    TranslateModule,
    ChatWindowComponent,
    ChatDataPanelComponent,
    LoadingComponent,
  ],
  templateUrl: './chat-shared.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex w-full h-full',
  },
})
export class ChatSharedComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly chatService = inject(ChatService);
  private readonly sharesService = inject(SharesService);

  readonly roomId = signal<string | null>(null);
  readonly shareId = signal<string | null>(null);
  readonly hasAccess = signal<boolean>(false);
  readonly isReadOnly = signal<boolean>(true);
  readonly isLoading = signal<boolean>(true);

  readonly messages = this.chatService.messages;
  readonly isMessagesLoading = this.chatService.isLoading;

  readonly backRoute = computed(() => ROUTES.APP.CHAT_NEW);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const shareId = params.get('shareId');
      this.shareId.set(shareId);

      if (shareId) {
        void this.loadSharedRoom(shareId);
      } else {
        this.isLoading.set(false);
        this.hasAccess.set(false);
      }
    });
  }

  ngOnDestroy(): void {
    this.chatService.clearSharedRoomContext();
  }

  private async loadSharedRoom(shareId: string): Promise<void> {
    this.isLoading.set(true);
    this.hasAccess.set(false);

    try {
      const access = await this.sharesService.resolveShareAccess(shareId);
      this.hasAccess.set(true);
      this.isReadOnly.set(access.isReadOnly);
      this.roomId.set(access.roomId);
      await this.chatService.openSharedRoom(access, shareId);
    } catch {
      this.hasAccess.set(false);
      this.chatService.clearSharedRoomContext();
    } finally {
      this.isLoading.set(false);
    }
  }
}
