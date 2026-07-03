import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  TableListComponent,
  TableListItemComponent,
  ContextMenuComponent,
} from '@shared/components';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { AdminTemplate } from '@app-types/admin/template.types';

@Component({
  selector: 'app-template-list-items',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    SvgIconComponent,
    ContextMenuComponent,
  ],
  templateUrl: './template-list-items.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateListItemsComponent {
  readonly items = input.required<AdminTemplate[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly allSelected = input<boolean>(false);
  readonly someSelected = input<boolean>(false);
  readonly openMenuId = input<string | null>(null);

  readonly selectAllChange = output<boolean>();
  readonly itemSelectChange = output<{ id: string; checked: boolean }>();
  readonly editTemplate = output<AdminTemplate>();
  readonly deleteTemplate = output<AdminTemplate>();
  readonly toggleMenu = output<string>();

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  formatTeams(teams: string[]): string {
    return teams.join(', ');
  }
}
