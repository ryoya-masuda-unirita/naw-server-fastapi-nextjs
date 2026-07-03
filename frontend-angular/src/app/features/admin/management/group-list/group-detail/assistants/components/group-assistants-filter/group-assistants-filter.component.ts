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
import { ASSISTANT_SERVER_TYPE } from '@features/admin/management/assistant-list/assistant-list.constants';
import { AssistantListApiService } from '@features/admin/management/assistant-list/services/assistant-list-api.service';

export interface AssistantsFilterChange {
  query: string;
  typeFilter: string;
  categoryFilter: string;
  sortField: string;
  sortOrder: 'asc' | 'desc';
}

@Component({
  selector: 'app-group-assistants-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SearchInputComponent,
    SelectComponent,
    FormSortInputComponent,
  ],
  templateUrl: './group-assistants-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupAssistantsFilterComponent {
  private readonly translate = inject(TranslateService);
  private readonly assistantListApi = inject(AssistantListApiService);

  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');

  readonly pageIndexChange = output<number>();
  readonly filterChange = output<AssistantsFilterChange>();

  readonly searchQuery = signal<string>('');
  readonly typeFilter = signal<string>('');
  readonly categoryFilter = signal<string>('');
  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<'asc' | 'desc'>('desc');
  private readonly loadedCategoryOptions = signal<SelectOption[]>([]);

  private readonly currentLang = signal<string>(this.translate.currentLang);

  constructor() {
    this.translate.onLangChange.subscribe((event) => this.currentLang.set(event.lang));
    void this.loadCategoryOptions();
  }

  readonly typeOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: '', label: this.translate.instant('TEAM.ASSISTANT.ALL_SERVERS') },
      {
        value: ASSISTANT_SERVER_TYPE.SECURE,
        label: this.translate.instant('TEAM.ASSISTANT.SERVER_LOCAL'),
      },
      {
        value: ASSISTANT_SERVER_TYPE.SAAS_CHAT,
        label: this.translate.instant('TEAM.ASSISTANT.SERVER_CLOUD_GENERAL'),
      },
      {
        value: ASSISTANT_SERVER_TYPE.SAAS_RAG,
        label: this.translate.instant('TEAM.ASSISTANT.SERVER_CLOUD_SPECIFIED'),
      },
    ];
  });

  readonly categoryOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: '', label: this.translate.instant('TEAM.ASSISTANT.ALL_CATEGORIES') },
      ...this.loadedCategoryOptions(),
    ];
  });

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'addedAt', label: this.translate.instant('TEAM.ASSISTANT.SORT_BY_ADDED') },
      { value: 'name', label: this.translate.instant('TEAM.ASSISTANT.SORT_BY_NAME') },
      { value: 'server', label: this.translate.instant('TEAM.ASSISTANT.SORT_BY_SERVER') },
      { value: 'category', label: this.translate.instant('TEAM.ASSISTANT.SORT_BY_CATEGORY') },
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

  onTypeFilterChange(value: string | null): void {
    this.typeFilter.set(value ?? '');
    this.emit();
  }

  onCategoryFilterChange(value: string | null): void {
    this.categoryFilter.set(value ?? '');
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
      typeFilter: this.typeFilter(),
      categoryFilter: this.categoryFilter(),
      sortField: this.sortField() ?? '',
      sortOrder: this.sortOrder(),
    });
  }

  private async loadCategoryOptions(): Promise<void> {
    try {
      const categories = await this.assistantListApi.listCategories();
      this.loadedCategoryOptions.set(
        categories.map((category) => ({
          value: category.id,
          label: category.name,
        })),
      );
    } catch {
      this.loadedCategoryOptions.set([]);
    }
  }
}
