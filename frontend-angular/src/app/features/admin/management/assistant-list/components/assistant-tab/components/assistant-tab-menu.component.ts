import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output, ViewChild } from '@angular/core';
import { AssistantApiItem } from '@app-types/admin/assistant.types';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';

@Component({
  selector: 'app-assistant-tab-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, AppMatIconComponent],
  templateUrl: './assistant-tab-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AssistantTabMenuComponent {
  @ViewChild(ContextMenuComponent) menu!: ContextMenuComponent;

  readonly item = input.required<AssistantApiItem>();

  readonly editAssistant = output<AssistantApiItem>();
  readonly deleteAssistant = output<AssistantApiItem>();

  onEditAssistant(event: Event): void {
    event.stopPropagation();
    this.menu?.close();
    this.editAssistant.emit(this.item());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.menu?.close();
    this.deleteAssistant.emit(this.item());
  }
}
