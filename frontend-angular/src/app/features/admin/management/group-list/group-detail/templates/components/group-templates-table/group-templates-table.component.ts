import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TableListComponent, TableListItemComponent } from '@shared/components';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { TemplateApiItem } from '@app-types/admin/template.types';

@Component({
  selector: 'app-group-templates-table',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    IconButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-templates-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupTemplatesTableComponent {
  readonly items = input.required<TemplateApiItem[]>();
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
