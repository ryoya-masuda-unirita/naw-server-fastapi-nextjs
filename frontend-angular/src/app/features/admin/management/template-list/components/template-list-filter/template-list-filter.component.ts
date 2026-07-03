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
import { SelectComponent } from '@shared/components/select/select.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { SelectOption } from '@app-types/common';
import { TemplateSortField, TemplateSortOrder } from '@app-types/admin/template.types';

export interface TemplateFilterChange {
  query: string;
  team: string;
  sortField: TemplateSortField;
  sortOrder: TemplateSortOrder;
}

const ALL_TEAMS = '__all__';
const NO_TEAM = '__none__';

@Component({
  selector: 'app-template-list-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SearchInputComponent,
    SelectComponent,
    FormSortInputComponent,
  ],
  templateUrl: './template-list-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateListFilterComponent {
  private readonly translate = inject(TranslateService);

  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');
  /** Loaded from `GET /api/admin/groups`. The "全ての所属チーム" sentinel is prepended internally. */
  readonly teams = input<string[]>([]);

  readonly pageIndexChange = output<number>();
  readonly filterChange = output<TemplateFilterChange>();

  readonly searchQuery = signal<string>('');
  readonly filterTeam = signal<string>('');
  readonly sortField = signal<TemplateSortField>(null);
  readonly sortOrder = signal<TemplateSortOrder>(null);

  private readonly currentLang = signal<string>(this.translate.currentLang);

  constructor() {
    this.translate.onLangChange.subscribe((event) => this.currentLang.set(event.lang));
  }

  readonly teamOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: ALL_TEAMS, label: this.translate.instant('TEMPLATES.ALL_TEAMS') },
      { value: NO_TEAM, label: this.translate.instant('TEMPLATES.NO_TEAM') },
      ...this.teams().map((t) => ({ value: t, label: t })),
    ];
  });

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('TEMPLATES.SORT_BY_UPDATED') },
      { value: 'name', label: this.translate.instant('TEMPLATES.SORT_BY_NAME') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('TEMPLATES.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('TEMPLATES.SORT_DESC') },
    ];
  });

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.emit();
  }

  onTeamChange(value: string | null) {
    this.filterTeam.set(value ?? ALL_TEAMS);
    this.emit();
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set((value as TemplateSortField) ?? 'updatedAt');
    this.emit();
  }

  onSortOrderChange(value: string | null) {
    this.sortOrder.set(value as TemplateSortOrder);
    this.emit();
  }

  onPageChange(page: number) {
    this.pageIndexChange.emit(page);
  }

  private emit() {
    this.filterChange.emit({
      query: this.searchQuery(),
      team: this.filterTeam(),
      sortField: this.sortField(),
      sortOrder: this.sortOrder(),
    });
  }
}
