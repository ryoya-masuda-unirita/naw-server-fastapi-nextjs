import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { ChatDataPanelComponent } from '@features/chat/components/chat-data-panel/chat-data-panel.component';
import { ChatWindowComponent } from '@features/chat/components/chat-window/chat-window.component';
import { ChatService } from '@features/chat/services/chat.service';
import { LoadingComponent } from '@app/shared/components';

@Component({
  selector: 'app-feedback-preview',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    MatIconModule,
    ChatWindowComponent,
    ChatDataPanelComponent,
    LoadingComponent,
  ],
  templateUrl: './feedback-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-screen! overflow-hidden bg-white w-full',
  },
})
export class FeedbackPreviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly chatService = inject(ChatService);

  readonly roomId = signal<string | null>(null);

  readonly messages = this.chatService.messages;
  readonly isLoading = this.chatService.isLoading;

  readonly showViewer = computed(() => this.messages().some((msg) => msg.role === 'assistant'));

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      const roomId = params['roomId'];
      this.roomId.set(roomId);
      if (roomId) {
        void this.chatService.loadMessagesForRoom(roomId, true);
        this.chatService.selectRoom(roomId);
      }
    });
  }
}
