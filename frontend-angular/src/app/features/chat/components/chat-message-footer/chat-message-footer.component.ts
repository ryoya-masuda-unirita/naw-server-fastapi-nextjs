/* eslint-disable @angular-eslint/no-output-native */
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-chat-message-footer',
  standalone: true,
  imports: [SvgIconComponent, TranslateModule],
  templateUrl: './chat-message-footer.component.html',
  styleUrl: './chat-message-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class ChatMessageFooterComponent {
  readonly showPagination = input<boolean>(false);
  readonly versionCurrent = input<number>(1);
  readonly versionTotal = input<number>(1);
  readonly canPrevVersion = input<boolean>(false);
  readonly canNextVersion = input<boolean>(false);
  readonly isUser = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly assistantUnresolved = input<boolean>(false);
  readonly thumbsUpActive = input<boolean>(false);
  readonly thumbsDownActive = input<boolean>(false);

  readonly copy = output<void>();
  readonly thumbsUp = output<void>();
  readonly thumbsDown = output<void>();
  readonly regenerate = output<void>();
  readonly delete = output<void>();
  readonly openEdit = output<void>();
  readonly prevVersion = output<void>();
  readonly nextVersion = output<void>();

  readonly isCopied = signal<boolean>(false);

  handleCopy(): void {
    this.isCopied.set(true);
    setTimeout(() => this.isCopied.set(false), 2000);
    this.copy.emit();
  }

  handleThumbsUp(): void {
    if (this.thumbsUpActive()) return;
    this.thumbsUp.emit();
  }

  handleThumbsDown(): void {
    if (this.thumbsDownActive()) return;
    this.thumbsDown.emit();
  }

  handleRegenerate(): void {
    if (this.assistantUnresolved()) return;
    this.regenerate.emit();
  }

  handleOpenEdit(): void {
    if (this.assistantUnresolved()) return;
    this.openEdit.emit();
  }

  handleDelete(): void {
    this.delete.emit();
  }
}
