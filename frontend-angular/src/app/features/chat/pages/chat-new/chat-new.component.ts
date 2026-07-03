import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { TranslateModule } from '@ngx-translate/core';
import { ChatService } from '../../services/chat.service';
import { LoadingComponent } from '@app/shared/components';
import { ActivatedRoute } from '@angular/router';
import { ChatWindowComponent } from '../../components/chat-window/chat-window.component';

@Component({
  selector: 'app-chat-new',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatIconModule,
    MatMenuModule,
    LoadingComponent,
    ChatWindowComponent,
  ],
  templateUrl: './chat-new.component.html',
  styleUrl: './chat-new.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-screen overflow-hidden bg-white',
  },
})
export class ChatNewComponent implements OnInit {
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
        this.chatService.selectRoom(roomId);
      } else {
        this.chatService.startNewChat();
      }
    });
  }
}
