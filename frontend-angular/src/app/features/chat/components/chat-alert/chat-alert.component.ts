import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-chat-alert',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './chat-alert.component.html',
  styleUrl: './chat-alert.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatAlertComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();

  readonly dismissed = output<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
