import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { SelectOption } from '@app-types/common';
import type { CountStatItem, FeedbackUserItem } from '@app-types/admin/feedback.types';
import { FeedbackUserApiService } from '../../services/feedback-user-api.service';
import { FeedbackListOptionsService } from '../../services/feedback-list-options.service';

@Component({
  selector: 'app-count-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SelectComponent,
    TableListComponent,
    TableListItemComponent,
    FormSortInputComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './count-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class CountTabComponent {
  private readonly translate = inject(TranslateService);
  private readonly feedbackUserApiService = inject(FeedbackUserApiService);
  private readonly feedbackListOptionsService = inject(FeedbackListOptionsService);

  readonly currentLang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
    initialValue: this.translate.getCurrentLang(),
  });

  // Filter state
  readonly selectedResponseStatus = signal<string | null>(null);
  readonly selectedSatisfaction = signal<string | null>(null);
  readonly sortField = signal<string | null>('updatedAt');
  readonly sortOrder = signal<string | null>('desc');
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly usersQuery = this.feedbackUserApiService.injectFeedbackUsersQuery(() => ({
    page: this.currentPage() - 1,
    size: this.pageSize(),
    responseStatus: toResponseStatusParam(this.selectedResponseStatus()),
    satisfaction: toSatisfactionParam(this.selectedSatisfaction()),
    sortField: this.sortField() ?? undefined,
    sortOrder: this.sortOrder() ?? undefined,
  }));

  readonly adminUsersQuery = this.feedbackUserApiService.injectAdminUsersQuery(() => ({
    query: undefined,
    pageIndex: this.currentPage(),
    pageSize: this.pageSize(),
    sortField: 'updatedAt',
    sortOrder: 'desc',
  }));

  readonly userNameMap = computed<Map<string, string>>(() => {
    const map = new Map<string, string>();
    (this.adminUsersQuery.data()?.data ?? []).forEach((user) => {
      map.set(user.id, user.displayName);
      map.set(user.userId, user.displayName);
    });
    return map;
  });

  readonly items = computed<CountStatItem[]>(() =>
    (this.usersQuery.data()?.feedbacks.content ?? []).map((item) =>
      toCountStatItem(item, this.userNameMap()),
    ),
  );

  readonly isLoading = computed(
    () => this.usersQuery.isFetching() || this.adminUsersQuery.isFetching(),
  );

  // Filter options
  readonly responseStatusOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: 'all', label: this.translate.instant('FEEDBACK.ALL_RESPONSES') },
      { value: 'has_response', label: this.translate.instant('FEEDBACK.RESPONDED') },
      { value: 'no_response', label: this.translate.instant('FEEDBACK.NO_RESPONSE') },
    ];
  });

  readonly satisfactionOptions = this.feedbackListOptionsService.satisfactionOptions;

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('FEEDBACK.SORT_BY_UPDATED') },
      { value: 'name', label: this.translate.instant('FEEDBACK.SORT_BY_USER') },
      { value: 'count', label: this.translate.instant('FEEDBACK.SORT_BY_ACCURACY_COUNT') },
      { value: 'review1', label: this.translate.instant('FEEDBACK.SORT_BY_SAT1') },
      { value: 'review2', label: this.translate.instant('FEEDBACK.SORT_BY_SAT2') },
      { value: 'review3', label: this.translate.instant('FEEDBACK.SORT_BY_SAT3') },
      { value: 'review4', label: this.translate.instant('FEEDBACK.SORT_BY_SAT4') },
      { value: 'review5', label: this.translate.instant('FEEDBACK.SORT_BY_SAT5') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('FEEDBACK.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('FEEDBACK.SORT_DESC') },
    ];
  });

  readonly filteredItems = computed(() => this.items());

  readonly paginatedItems = computed(() => this.filteredItems());

  readonly totalPages = computed(() => this.usersQuery.data()?.feedbacks.totalPages ?? 1);

  readonly pageRange = computed(() => {
    const feedbacks = this.usersQuery.data()?.feedbacks;
    const total = feedbacks?.totalElements ?? 0;
    const page = feedbacks?.number ?? 0;
    const size = feedbacks?.size ?? this.pageSize();
    const from = total > 0 ? page * size + 1 : 0;
    const to = Math.min(from + (feedbacks?.numberOfElements ?? 0) - 1, total);
    return { from, to, total };
  });

  readonly countDisplay = computed(() => {
    const r = this.pageRange();
    if (r.total === 0) return '';
    return this.translate.instant('FEEDBACK.PAGE_COUNT', r);
  });

  // Event handlers
  onResponseStatusChange(value: string | null) {
    this.selectedResponseStatus.set(value);
    this.currentPage.set(1);
  }

  onSatisfactionChange(value: string | null) {
    this.selectedSatisfaction.set(value);
    this.currentPage.set(1);
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set(value);
    this.currentPage.set(1);
  }

  onSortOrderChange(value: string | null) {
    if (value) this.sortOrder.set(value);
    this.currentPage.set(1);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }
}

function toResponseStatusParam(value: string | null): string | undefined {
  return value && value !== 'all' ? value : undefined;
}

function toSatisfactionParam(value: string | null): string | undefined {
  return value && value !== 'all' ? value : undefined;
}

function toCountStatItem(item: FeedbackUserItem, userNameMap: Map<string, string>): CountStatItem {
  return {
    id: item.user.id,
    userName:
      userNameMap.get(item.user.id) ?? userNameMap.get(item.user.userId) ?? item.user.displayName,
    isResponded: item.isResponded,
    updatedAt: item.updatedAt,
    accuracyCount: item.feedbackMessageCount,
    satisfaction1: item.feedbackRoomCount.poor,
    satisfaction2: item.feedbackRoomCount.average,
    satisfaction3: item.feedbackRoomCount.good,
    satisfaction4: item.feedbackRoomCount.veryGood,
    satisfaction5: item.feedbackRoomCount.excellent,
  };
}
