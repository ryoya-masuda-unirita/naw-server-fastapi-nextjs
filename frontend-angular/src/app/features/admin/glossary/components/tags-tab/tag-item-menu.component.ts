import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';

@Component({
  selector: 'app-glossary-tag-item-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, SvgIconComponent],
  templateUrl: './tag-item-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TagItemMenuComponent {
  readonly item = input.required<GlossaryTagItem>();

  readonly editSettings = output<GlossaryTagItem>();
  readonly deleteItem = output<GlossaryTagItem>();

  onEditSettings(event: Event): void {
    event.stopPropagation();
    this.editSettings.emit(this.item());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteItem.emit(this.item());
  }
}
