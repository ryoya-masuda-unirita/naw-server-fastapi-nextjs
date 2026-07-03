import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TrainingDataFile } from '@app-types/training-data.types';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';

@Component({
  selector: 'app-training-data-table',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    PaginationComponent,
    IconButtonComponent,
    SvgIconComponent,
    ContextMenuComponent,
  ],
  templateUrl: './training-data-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class TrainingDataTableComponent {
  readonly files = input.required<TrainingDataFile[]>();
  readonly selectedFiles = input.required<TrainingDataFile[]>();
  readonly isRenamingMode = input.required<boolean>();
  readonly editingNames = input.required<Record<string, { displayName: string; name: string }>>();
  readonly showDownload = input<boolean>(false);

  readonly totalPages = input.required<number>();
  readonly currentPage = input.required<number>();

  readonly selectAllChange = output<boolean>();
  readonly toggleItemSelection = output<{ row: TrainingDataFile; checked: boolean }>();
  readonly updateEditingValue = output<{
    id: string;
    field: 'displayName' | 'name';
    value: string;
  }>();
  readonly rowClick = output<TrainingDataFile>();
  readonly download = output<TrainingDataFile>();
  readonly preview = output<TrainingDataFile>();
  readonly editLearningData = output<TrainingDataFile>();
  readonly toggleLearning = output<TrainingDataFile>();
  readonly deleteFile = output<TrainingDataFile>();
  readonly pageChange = output<number>();

  allSelected = computed(() => {
    const files = this.files();
    return files.length > 0 && this.selectedFiles().length === files.length;
  });

  someSelected = computed(() => {
    return this.selectedFiles().length > 0 && !this.allSelected();
  });

  isSelected(id: string): boolean {
    return this.selectedFiles()
      .map((item) => item.id)
      .includes(id);
  }
}
