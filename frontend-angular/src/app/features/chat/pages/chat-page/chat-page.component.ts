import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ChatWindowComponent } from '../../components/chat-window/chat-window.component';
import { ChatService } from '../../services/chat.service';

@Component({
  selector: 'app-chat-page',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIconModule, ChatWindowComponent],
  templateUrl: './chat-page.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full overflow-hidden bg-white',
  },
})
export class ChatPageComponent {
  private readonly chatService = inject(ChatService);

  // Expose service signals
  readonly messages = this.chatService.messages;
  readonly isLoading = this.chatService.isLoading;
}
