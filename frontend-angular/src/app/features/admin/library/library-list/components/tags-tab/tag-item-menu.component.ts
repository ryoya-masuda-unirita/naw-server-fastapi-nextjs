import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TagItem } from '@app-types/admin/library.types';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';

@Component({
  selector: 'app-tag-item-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, AppMatIconComponent],
  templateUrl: './tag-item-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TagItemMenuComponent {
  readonly item = input.required<TagItem>();

  readonly editSettings = output<TagItem>();
  readonly deleteItem = output<TagItem>();

  onEditSettings(event: Event): void {
    event.stopPropagation();
    this.editSettings.emit(this.item());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteItem.emit(this.item());
  }
}
