import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChatErrorComponent } from '@app/features/chat/components/chat-error/chat-error.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-message-error-section',
  standalone: true,
  imports: [ChatErrorComponent, TranslateModule],
  templateUrl: './message-error-section.component.html',
  styleUrl: './message-error-section.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class MessageErrorSectionComponent {
  readonly errorMessage = input.required<string | undefined>();
}
