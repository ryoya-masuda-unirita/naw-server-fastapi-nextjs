import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-chat-error',
  standalone: true,
  imports: [TranslateModule, SvgIconComponent],
  templateUrl: './chat-error.component.html',
  styleUrl: './chat-error.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatErrorComponent {
  readonly title = input.required<string>();
  readonly message = input.required<string>();

  readonly dismissed = output<void>();

  dismiss(): void {
    this.dismissed.emit();
  }
}
