import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { DropdownService } from '@core/services/dropdown.service';
import { UiStore } from '@core/stores/ui.store';
import { MatIconModule } from '@angular/material/icon';
import { NgClass } from '@angular/common';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-chat-header',
  standalone: true,
  imports: [TranslateModule, MatIconModule, NgClass, SvgIconComponent],
  templateUrl: './chat-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHeaderComponent {
  readonly title = input.required<string>();
  readonly isReadOnly = input<boolean>(false);
  readonly isHideName = input<boolean>(false);

  readonly renameClick = output<void>();
  readonly newChatClick = output<void>();
  readonly shareClick = output<void>();
  readonly likeClick = output<void>();
  readonly settingsClick = output<void>();

  private readonly dropdownService = inject(DropdownService);
  private readonly uiStore = inject(UiStore);

  readonly isMoreMenuOpen = signal<boolean>(false);

  toggleSidebar(): void {
    this.uiStore.toggleMobileSidebar();
  }

  toggleMoreMenu(): void {
    if (this.isMoreMenuOpen()) {
      this.isMoreMenuOpen.set(false);
      this.dropdownService.notifyClosed();
      return;
    }
    this.isMoreMenuOpen.set(true);
    this.dropdownService.open(() => this.closeMoreMenu());
  }

  closeMoreMenu(): void {
    this.isMoreMenuOpen.set(false);
  }

  handleRename(): void {
    this.closeMoreMenu();
    this.dropdownService.notifyClosed();
    this.renameClick.emit();
  }

  handleSettings(): void {
    this.closeMoreMenu();
    this.dropdownService.notifyClosed();
    this.settingsClick.emit();
  }

  handleShare(): void {
    this.closeMoreMenu();
    this.dropdownService.notifyClosed();
    this.shareClick.emit();
  }

  handleLike(): void {
    this.closeMoreMenu();
    this.dropdownService.notifyClosed();
    this.likeClick.emit();
  }
}
