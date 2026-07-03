import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-chat-message-logo',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './chat-message-logo.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex flex-col items-center justify-center md:justify-start h-full md:h-auto min-h-56.5 md:min-h-auto p-4 md:p-0 md:pt-10 md:mb-6',
  },
})
export class ChatMessageLogoComponent {
  readonly isNewChat = input<boolean>(false);
  readonly assistantDescription = input<string>('');
}
