import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';

@Component({
  selector: 'app-user-password-reveal-dialog',
  standalone: true,
  imports: [CommonModule, TranslateModule, ButtonComponent],
  templateUrl: './user-password-reveal-dialog.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserPasswordRevealDialogComponent {
  readonly initialPassword = input.required<string>();
  readonly passwordExpiredAt = input.required<string>();

  readonly copied = signal(false);

  get formattedExpiredAt(): string {
    const d = new Date(this.passwordExpiredAt());
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async copyPassword(): Promise<void> {
    await navigator.clipboard.writeText(this.initialPassword());
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 3000);
  }
}
