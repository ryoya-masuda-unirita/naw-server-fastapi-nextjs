import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, ViewChild } from '@angular/core';
import { AssistantCategoryApiItem } from '@app-types/admin/assistant.types';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';

@Component({
  selector: 'app-category-tab-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, AppMatIconComponent],
  templateUrl: './category-tab-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class CategoryTabMenuComponent {
  @ViewChild(ContextMenuComponent) menu!: ContextMenuComponent;

  readonly item = input.required<AssistantCategoryApiItem>();

  readonly editCategory = output<AssistantCategoryApiItem>();
  readonly deleteCategory = output<AssistantCategoryApiItem>();

  onEditCategory(event: Event): void {
    event.stopPropagation();
    this.menu?.close();
    this.editCategory.emit(this.item());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.menu?.close();
    this.deleteCategory.emit(this.item());
  }
}
