import {
  Component,
  ChangeDetectionStrategy,
  output,
  signal,
  input,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { PaginationComponent, PeriodFilterComponent } from '@app/shared/components';
import {
  PeriodChange,
  PeriodOption,
  PeriodRange,
} from '@app/shared/components/filter/period-filter/period-filter.component';
import { SelectWithSearchComponent } from '@app/shared/components/select-with-search/select.component';
import { SelectOption } from '@app-types/common';
import { ChatHistorySortField, ChatHistorySortOrder } from '@app-types/chat-history.types';
import { SearchInputComponent } from '@app/shared/components/input/search-input.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@app/shared/components/form/form-sort-input/form-sort-input.component';

export interface ChatHistoryFilterChange {
  period: string;
  periodRange: PeriodRange | null;
  user: string | null;
  query: string;
  sortField: ChatHistorySortField | null;
  sortOrder: ChatHistorySortOrder | null;
}

@Component({
  selector: 'app-chat-history-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    PeriodFilterComponent,
    SelectWithSearchComponent,
    SearchInputComponent,
    FormSortInputComponent,
  ],
  templateUrl: './chat-history-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatHistoryFilterComponent {
  private readonly translate = inject(TranslateService);

  // Inputs
  readonly pageSize = input<number>(10);
  readonly pageIndex = input<number>(1);
  readonly totalItems = input<number>(0);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');
  readonly userOptions = input<SelectOption[]>([]);

  // Outputs
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
  readonly pageIndexChange = output<number>();
  readonly filterChange = output<ChatHistoryFilterChange>();

  // Filter State
  readonly filterPeriod = signal<string>('');
  readonly filterPeriodRange = signal<PeriodRange | null>(null);
  readonly filterUser = signal<string | null>(null);
  readonly searchQuery = signal<string>('');
  readonly sortField = signal<ChatHistorySortField>('updatedAt');
  readonly sortOrder = signal<ChatHistorySortOrder>('desc');

  // Track language changes
  private readonly currentLang = signal<string>(this.translate.getCurrentLang());

  constructor() {
    this.translate.onLangChange.subscribe((event) => {
      this.currentLang.set(event.lang);
    });
  }

  readonly periodOptions = computed<PeriodOption[]>(() => {
    this.currentLang();
    return [
      { value: '', label: 'COMMON.PERIOD_FILTER.ALL_PERIODS' },
      { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
      { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
      { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
    ];
  });

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('CHAT_HISTORY.SORT_BY_UPDATED') },
      { value: 'userName', label: this.translate.instant('CHAT_HISTORY.SORT_BY_USER') },
      { value: 'roomName', label: this.translate.instant('CHAT_HISTORY.SORT_BY_CHAT') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('CHAT_HISTORY.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('CHAT_HISTORY.SORT_DESC') },
    ];
  });

  onPeriodChange(event: PeriodChange) {
    this.filterPeriod.set(event.value);
    this.filterPeriodRange.set(event.range);
    this.emitFilterChange();
  }

  onUserChange(value: string | null) {
    this.filterUser.set(value);
    this.emitFilterChange();
  }

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.emitFilterChange();
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set((value as ChatHistorySortField) ?? 'updatedAt');
    this.emitFilterChange();
  }

  onSortOrderChange(value: string | null) {
    this.sortOrder.set((value as ChatHistorySortOrder) ?? 'desc');
    this.emitFilterChange();
  }

  onPageChange(page: number) {
    this.pageChange.emit(page);
    this.pageIndexChange.emit(page);
  }

  onPageSizeChange(size: number) {
    this.pageSizeChange.emit(size);
  }

  private emitFilterChange() {
    this.filterChange.emit({
      period: this.filterPeriod(),
      periodRange: this.filterPeriodRange(),
      user: this.filterUser(),
      query: this.searchQuery(),
      sortField: this.sortField(),
      sortOrder: this.sortOrder(),
    });
  }
}
