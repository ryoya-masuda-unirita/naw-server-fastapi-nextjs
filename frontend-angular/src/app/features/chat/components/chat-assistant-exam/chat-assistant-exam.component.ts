import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { CircularLoadingComponent } from '@app/shared/components/circular-loading/circular-loading.component';
import { ChatErrorComponent } from '../chat-error/chat-error.component';
import { ChatMessageFooterComponent } from '../chat-message-footer/chat-message-footer.component';

@Component({
  selector: 'app-chat-assistant-exam',
  standalone: true,
  imports: [
    CommonModule,
    SvgIconComponent,
    CircularLoadingComponent,
    ChatErrorComponent,
    ChatMessageFooterComponent,
  ],
  templateUrl: './chat-assistant-exam.component.html',
  styleUrl: './chat-assistant-exam.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'chat-page-messages-wrapper' },
})
export class ChatAssistantExamComponent {
  readonly isCodeCopied = signal(false);

  handleCodeCopy(): void {
    this.isCodeCopied.set(true);
    setTimeout(() => this.isCodeCopied.set(false), 2000);
  }
}
