import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TableListComponent, TableListItemComponent } from '@shared/components';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { GroupAssistantItem } from '@app-types/admin/group-management.types';

@Component({
  selector: 'app-group-assistants-table',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    IconButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-assistants-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupAssistantsTableComponent {
  readonly items = input.required<GroupAssistantItem[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly allSelected = input<boolean>(false);
  readonly someSelected = input<boolean>(false);

  readonly selectAllChange = output<boolean>();
  readonly itemSelectChange = output<{ id: string; checked: boolean }>();
  readonly deleteItem = output<string>();

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }
}
