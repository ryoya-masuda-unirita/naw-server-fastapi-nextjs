import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PaginationComponent } from '@shared/components';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { GroupSortField, GroupSortOrder } from '@app-types/admin/group-management.types';

export interface GroupListFilterChange {
  query: string;
  sortField: GroupSortField;
  sortOrder: GroupSortOrder;
}

@Component({
  selector: 'app-group-list-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SearchInputComponent,
    FormSortInputComponent,
  ],
  templateUrl: './group-list-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupListFilterComponent {
  private readonly translate = inject(TranslateService);

  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');

  readonly pageIndexChange = output<number>();
  readonly filterChange = output<GroupListFilterChange>();

  readonly searchQuery = signal<string>('');
  readonly sortField = signal<GroupSortField>('updatedAt');
  readonly sortOrder = signal<GroupSortOrder>('desc');

  private readonly currentLang = signal<string>(this.translate.currentLang);

  constructor() {
    this.translate.onLangChange.subscribe((event) => this.currentLang.set(event.lang));
  }

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('GROUPS.SORT_BY_UPDATED') },
      { value: 'name', label: this.translate.instant('GROUPS.SORT_BY_NAME') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('GROUPS.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('GROUPS.SORT_DESC') },
    ];
  });

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.emit();
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set((value as GroupSortField) ?? 'updatedAt');
    this.emit();
  }

  onSortOrderChange(value: string) {
    this.sortOrder.set(value as GroupSortOrder);
    this.emit();
  }

  onPageChange(page: number) {
    this.pageIndexChange.emit(page);
  }

  private emit() {
    this.filterChange.emit({
      query: this.searchQuery(),
      sortField: this.sortField(),
      sortOrder: this.sortOrder(),
    });
  }
}
