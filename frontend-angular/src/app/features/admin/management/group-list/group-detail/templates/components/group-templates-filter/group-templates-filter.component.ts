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

export interface TemplatesFilterChange {
  query: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}

@Component({
  selector: 'app-group-templates-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SearchInputComponent,
    FormSortInputComponent,
  ],
  templateUrl: './group-templates-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupTemplatesFilterComponent {
  private readonly translate = inject(TranslateService);

  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');

  readonly pageIndexChange = output<number>();
  readonly filterChange = output<TemplatesFilterChange>();

  readonly searchQuery = signal<string>('');
  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<'asc' | 'desc'>('desc');

  private readonly currentLang = signal<string>(this.translate.currentLang);

  constructor() {
    this.translate.onLangChange.subscribe((event) => this.currentLang.set(event.lang));
  }

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'addedAt', label: this.translate.instant('TEAM.TEMPLATE.SORT_BY_ADDED') },
      { value: 'name', label: this.translate.instant('TEAM.TEMPLATE.SORT_BY_NAME') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('COMMON.ASC') },
      { value: 'desc', label: this.translate.instant('COMMON.DESC') },
    ];
  });

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
    this.emit();
  }

  onSortFieldChange(value: string | null): void {
    this.sortField.set(value);
    this.emit();
  }

  onSortOrderChange(value: string): void {
    this.sortOrder.set(value as 'asc' | 'desc');
    this.emit();
  }

  onPageChange(page: number): void {
    this.pageIndexChange.emit(page);
  }

  private emit(): void {
    this.filterChange.emit({
      query: this.searchQuery(),
      sortField: this.sortField() ?? '',
      sortOrder: this.sortOrder(),
    });
  }
}
