import { CommonModule, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  TemplateRef,
  untracked,
  ViewChild,
} from '@angular/core';
import { injectQuery } from '@tanstack/angular-query-experimental';
import { CircularLoadingComponent } from '@shared/components/circular-loading/circular-loading.component';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent } from '@shared/components/button/button.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import {
  UsageLimitDialogComponent,
  UsageLimitFormData,
} from '../../components/usage-limit/usage-limit.component';
import { TenantApiService } from '../../services/tenant-api.service';
import { TenantUsageDialogService } from '../../services/tenant-usage-dialog.service';
import {
  buildUserDisplayNameMap,
  normalizeUserApiItem,
  userDisplayName,
} from '../../utils/user-display-name.util';
import { UserListApiService } from '@features/admin/management/user-list/services/user-list-api.service';
import { SelectOption } from '@app-types/common';
import { SelectComponent } from '@app/shared/components';
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 88;

@Component({
  selector: 'app-usage-tab',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    TranslateModule,
    PaginationComponent,
    ButtonComponent,
    SvgIconComponent,
    FormSortInputComponent,
    UsageLimitDialogComponent,
    SelectComponent,
    CircularLoadingComponent,
  ],
  templateUrl: './usage-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
})
export class UsageTabComponent {
  private readonly translate = inject(TranslateService);
  private readonly tenantApi = inject(TenantApiService);
  private readonly userApi = inject(UserListApiService);
  private readonly usageDialog = inject(TenantUsageDialogService);

  @ViewChild('wsLimitTemplate') wsLimitTemplate!: TemplateRef<unknown>;
  @ViewChild('userLimitTemplate') userLimitTemplate!: TemplateRef<unknown>;

  readonly tenantInfo = this.tenantApi.tenantInfoQuery.data;

  private readonly tokenUsageListResponse = computed(() =>
    this.tenantApi.tokenUsageListQuery.data(),
  );

  readonly usersQuery = injectQuery(() => ({
    queryKey: ['admin', 'users', 'tenant-usage-filter'],
    queryFn: () =>
      this.userApi.list({ pageSize: 500, pageIndex: 1, sortField: 'name', sortOrder: 'asc' }),
    staleTime: 5 * 60 * 1000,
  }));

  private readonly allUsers = computed(() =>
    (this.usersQuery.data()?.data ?? []).map(normalizeUserApiItem),
  );

  private readonly userDisplayNameById = computed(() => buildUserDisplayNameMap(this.allUsers()));

  readonly usageHistoryData = computed(() => {
    const names = this.userDisplayNameById();
    const contents = this.tokenUsageListResponse()?.contents ?? [];
    return contents.map((item) => ({
      id: item.id,
      datetime: item.createdAt,
      amount: item.totalCredits,
      user: item.userId ? (names.get(item.userId) ?? item.userId) : '-',
    }));
  });

  readonly usageHistoryTotal = computed(() => this.tokenUsageListResponse()?.totalCount ?? 0);
  readonly usageCurrentPage = computed(() => this.tenantApi.usagePage());
  readonly totalPagesUsage = computed(() => {
    const total = this.usageHistoryTotal();
    return total > 0 ? Math.ceil(total / TenantApiService.USAGE_HISTORY_PAGE_SIZE) : 1;
  });
  readonly usagePageRangeStart = computed(() => {
    const page = this.usageCurrentPage();
    const pageSize = TenantApiService.USAGE_HISTORY_PAGE_SIZE;
    return this.usageHistoryTotal() === 0 ? 0 : (page - 1) * pageSize + 1;
  });
  readonly usagePageRangeEnd = computed(() =>
    Math.min(
      this.usageCurrentPage() * TenantApiService.USAGE_HISTORY_PAGE_SIZE,
      this.usageHistoryTotal(),
    ),
  );
  readonly usageHistoryFetching = computed(() => this.tenantApi.tokenUsageListQuery.isFetching());

  readonly planName = computed(() => this.tenantInfo()?.subscription?.plan?.name ?? null);
  readonly monthlyTokenLimit = computed(
    () => this.tenantInfo()?.subscription?.plan?.maxCreditsPerMonth ?? 0,
  );
  readonly monthlyUsage = computed(
    () => this.tenantApi.tokenUsageSummaryQuery.data()?.totalCredits ?? 0,
  );
  readonly alertThreshold = computed(
    () => this.tenantInfo()?.subscription?.plan?.alertPercentage ?? null,
  );
  readonly todayLimit = computed(
    () => this.tenantInfo()?.subscription?.plan?.maxCreditsPerDay ?? 0,
  );
  readonly todayAlertThreshold = computed(
    () => this.tenantInfo()?.subscription?.plan?.dailyAlertPercentage ?? null,
  );

  readonly usageLimitForm = signal<UsageLimitFormData>({
    monthlyLimit: '',
    dailyLimit: '',
    alertPercentage: null,
    dailyAlertPercentage: null,
  });

  readonly userLimitForm = signal<UsageLimitFormData>({
    monthlyLimit: '',
    dailyLimit: '',
    alertPercentage: null,
    dailyAlertPercentage: null,
  });

  readonly wsLimitConfirmDisabled = computed(() => !this.usageLimitForm().monthlyLimit);
  readonly userLimitConfirmDisabled = computed(() => !this.userLimitForm().dailyLimit);

  constructor() {
    effect(() => {
      const field = this.selectedSortField();
      const order = this.selectedSortOrder();
      untracked(() => {
        this.tenantApi.usageSortField.set(field);
        this.tenantApi.usageSortOrder.set(order);
      });
    });

    effect(() => {
      this.selectedSortField();
      this.selectedSortOrder();
      untracked(() => this.tenantApi.usagePage.set(1));
    });
  }

  readonly donutDashArray = computed(() => String(DONUT_CIRCUMFERENCE));
  readonly donutDashOffset = computed(() => {
    const limit = this.monthlyTokenLimit();
    if (limit === 0) return String(DONUT_CIRCUMFERENCE);
    const pct = Math.min(this.monthlyUsage() / limit, 1);
    return String(DONUT_CIRCUMFERENCE * (1 - pct));
  });

  readonly userOptions = computed<SelectOption[]>(() => [
    { label: this.translate.instant('COMMON.PLACEHOLDERS.ALL_USERS'), value: '' },
    ...this.allUsers().map((u) => ({ label: userDisplayName(u), value: u.id })),
  ]);

  /** 利用者名による絞り込みがあるため、利用者によるソートは無しにする */
  readonly usageSortFields = model<SortOption[]>([
    { value: 'updated', label: 'TENANT.SORT_DEFAULT' },
    { value: 'amount', label: 'TENANT.HISTORY_AMOUNT' },
  ]);

  readonly selectedSortField = model<string | null>(null);
  readonly selectedSortOrder = model<string | null>(null);

  onUserFilterChange(value: string | null): void {
    this.tenantApi.usageUserFilter.set(value ?? '');
    this.tenantApi.usagePage.set(1);
  }

  onUsagePageChange(page: number): void {
    this.tenantApi.usagePage.set(page);
  }

  onOpenWsLimitDialog(): void {
    const info = this.tenantInfo();
    this.usageLimitForm.set({
      monthlyLimit: String(info?.subscription?.plan?.maxCreditsPerMonth ?? ''),
      dailyLimit: '',
      alertPercentage: info?.subscription?.plan?.alertPercentage
        ? String(info.subscription.plan.alertPercentage)
        : null,
      dailyAlertPercentage: null,
    });
    this.usageDialog.openUsageLimitDialog({
      titleKey: 'TENANT.WS_LIMIT_EDIT',
      content: this.wsLimitTemplate,
      confirmDisabled: this.wsLimitConfirmDisabled,
      onConfirm: async () => {
        const { monthlyLimit, alertPercentage } = this.usageLimitForm();
        await this.tenantApi.updateUsageLimit({
          maxCreditsPerMonth: Number(monthlyLimit),
          alertPercentage: alertPercentage ? Number(alertPercentage) : 0,
        });
      },
    });
  }

  onOpenUserLimitDialog(): void {
    const info = this.tenantInfo();
    this.userLimitForm.set({
      monthlyLimit: '',
      dailyLimit: String(info?.subscription?.plan?.maxCreditsPerDay ?? ''),
      alertPercentage: null,
      dailyAlertPercentage: info?.subscription?.plan?.dailyAlertPercentage
        ? String(info.subscription.plan.dailyAlertPercentage)
        : null,
    });
    this.usageDialog.openUsageLimitDialog({
      titleKey: 'TENANT.USER_LIMIT_EDIT',
      content: this.userLimitTemplate,
      confirmDisabled: this.userLimitConfirmDisabled,
      onConfirm: async () => {
        const { dailyLimit, dailyAlertPercentage } = this.userLimitForm();
        await this.tenantApi.updateUsageLimit({
          maxCreditsPerDay: dailyLimit ? Number(dailyLimit) : 0,
          dailyAlertPercentage: dailyAlertPercentage ? Number(dailyAlertPercentage) : 0,
        });
      },
    });
  }
}
