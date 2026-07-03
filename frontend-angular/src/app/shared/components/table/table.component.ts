import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { CheckboxComponent } from '@shared/components/checkbox/checkbox.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SortEvent, TableColumn } from './table.interface';

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [CommonModule, TranslateModule, MatIconModule, CheckboxComponent, AppMatIconComponent],
  templateUrl: './table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TableComponent {
  readonly data = input<any[]>([]);
  readonly columns = input<TableColumn[]>([]);
  readonly selectable = input(false);
  readonly sortable = input(false);
  readonly isLoading = input(false);
  readonly emptyMessage = input('COMMON.NO_DATA');
  readonly actionsTemplate = input<TemplateRef<any> | null>(null);
  readonly mobileRowTemplate = input<TemplateRef<any> | null>(null);
  readonly actionsWidth = input('w-25');
  readonly selectionWidth = input('w-6');
  readonly selectedClass = input('bg-secondary');
  readonly hoverClass = input('hover:bg-bg-brand-weak');

  readonly sortChange = output<SortEvent>();
  readonly selectionChange = output<any[]>();
  readonly rowClick = output<any>();

  selection = new SelectionModel<any>(true, []);
  currentSort: SortEvent = { field: '', direction: '' };

  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    effect(() => {
      this.data();
      this.clearSelection();
    });
  }

  clearSelection(): void {
    this.selection.clear();
    this.cdr.markForCheck();
    this.selectionChange.emit(this.selection.selected);
  }

  isAllSelected(): boolean {
    return this.selection.selected.length === this.data().length;
  }

  masterToggle(): void {
    if (this.isAllSelected()) {
      this.selection.clear();
    } else {
      this.data().forEach((row) => this.selection.select(row));
    }
    this.selectionChange.emit(this.selection.selected);
  }

  toggleSelection(row: any): void {
    this.selection.toggle(row);
    this.selectionChange.emit(this.selection.selected);
  }

  onSort(column: TableColumn): void {
    if (!this.sortable() || !column.sortable) return;

    if (this.currentSort.field !== column.field) {
      this.currentSort = { field: column.field, direction: 'asc' };
    } else if (this.currentSort.direction === 'asc') {
      this.currentSort = { field: column.field, direction: 'desc' };
    } else if (this.currentSort.direction === 'desc') {
      this.currentSort = { field: '', direction: '' };
    } else {
      this.currentSort = { field: column.field, direction: 'asc' };
    }

    this.sortChange.emit(this.currentSort);
  }

  onRowClick(row: any): void {
    this.rowClick.emit(row);
  }

  getCellValue(row: any, field: string): any {
    if (!field) return '';
    const fields = field.split('.');

    let value: any = row;
    for (const f of fields) {
      value = value ? value[f] : null;
    }
    return value;
  }
}
