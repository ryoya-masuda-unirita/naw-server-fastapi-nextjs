import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { LibraryPageItem } from '@app-types/admin/library.types';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';

@Component({
  selector: 'app-library-item-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, AppMatIconComponent],
  templateUrl: './library-item-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class LibraryItemMenuComponent {
  readonly item = input.required<LibraryPageItem>();
  // 自分が作成したライブラリのみ「コンテンツの設定を編集」を表示する（非所有者は更新APIが404になるため）
  readonly isOwner = input<boolean>(true);

  readonly editSettings = output<LibraryPageItem>();
  readonly copyLink = output<LibraryPageItem>();
  readonly deleteItem = output<LibraryPageItem>();

  readonly linkCopied = signal(false);

  onEditSettings(event: Event): void {
    event.stopPropagation();
    this.editSettings.emit(this.item());
  }

  onCopyLink(event: Event): void {
    event.stopPropagation();
    this.copyLink.emit(this.item());
    this.linkCopied.set(true);
    setTimeout(() => this.linkCopied.set(false), 3000);
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteItem.emit(this.item());
  }
}
