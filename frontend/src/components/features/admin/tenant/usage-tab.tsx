import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Pagination } from '@/components/shared/pagination';
import { Select } from '@/components/shared/select';
import type { SelectOption } from '@/components/shared/types';
import {
  useBillingPeriod,
  useBillingTokenUsageSummary,
  useTenantInfo,
  useTokenUsageList,
  useUsageFilterUsers,
} from '@/hooks/use-tenant';
import { formatUtcDate } from '@/lib/utils/api-datetime';
import { useTenantUsageStore } from '@/store/tenant-store';
import { formatNumber, formatUsageDateTime } from './tenant-format';
import { SHOW_USAGE_LIMIT_PANELS, USAGE_HISTORY_PAGE_SIZE } from './tenant.constants';
import { UsageLimitDialog, type UsageLimitMode } from './usage-limit-dialog';
import { buildUserDisplayNameMap, normalizeUserApiItem, userDisplayName } from './user-display-name';

/** ドーナツの円周（半径 88） */
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 88;

/** 利用者によるソートは、利用者名での絞り込みがあるため無しにする（移植元と同じ） */
const USAGE_SORT_FIELDS: SortOption[] = [
  { value: 'updated', label: 'TENANT.SORT_DEFAULT' },
  { value: 'amount', label: 'TENANT.HISTORY_AMOUNT' },
];

/** 移植元 `<app-usage-tab>`。利用プラン情報と、請求期間内の利用履歴 */
export function UsageTab() {
  const { t } = useTranslation();
  const { data: tenantInfo } = useTenantInfo();
  const billing = useBillingPeriod();
  const { data: summary } = useBillingTokenUsageSummary(billing.from);
  const { sortField, sortOrder, page, userFilter, setSort, setPage, setUserFilter, reset } = useTenantUsageStore();
  const { data: usageList, isFetching: usageHistoryFetching } = useTokenUsageList({
    from: billing.from,
    sortField,
    sortOrder,
    page,
    userId: userFilter,
  });
  const { data: usersData } = useUsageFilterUsers();
  const [limitDialog, setLimitDialog] = useState<UsageLimitMode | null>(null);

  // 移植元の条件は画面を開き直すと初期値から始まる。残すと絞り込み欄が空に見えたまま前回の条件が効く
  useEffect(() => reset, [reset]);

  const allUsers = useMemo(() => (usersData ?? []).map(normalizeUserApiItem), [usersData]);
  const userDisplayNameById = useMemo(() => buildUserDisplayNameMap(allUsers), [allUsers]);
  const userOptions = useMemo<SelectOption[]>(
    () => [
      { label: t('COMMON.PLACEHOLDERS.ALL_USERS'), value: '' },
      ...allUsers.map((user) => ({ label: userDisplayName(user), value: user.id })),
    ],
    [allUsers, t],
  );

  const usageHistoryData = (usageList?.contents ?? []).map((item) => ({
    id: item.id,
    datetime: item.createdAt,
    amount: item.totalCredits,
    user: item.userId ? (userDisplayNameById.get(item.userId) ?? item.userId) : '-',
  }));
  const usageHistoryTotal = usageList?.totalCount ?? 0;
  const totalPagesUsage = usageHistoryTotal > 0 ? Math.ceil(usageHistoryTotal / USAGE_HISTORY_PAGE_SIZE) : 1;
  const pageRangeStart = usageHistoryTotal === 0 ? 0 : (page - 1) * USAGE_HISTORY_PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(page * USAGE_HISTORY_PAGE_SIZE, usageHistoryTotal);

  const plan = tenantInfo?.subscription?.plan;
  const planName = plan?.name ?? null;
  const monthlyTokenLimit = plan?.maxCreditsPerMonth ?? 0;
  const monthlyUsage = summary?.totalCredits ?? 0;
  const alertThreshold = plan?.alertPercentage ?? null;
  const todayLimit = plan?.maxCreditsPerDay ?? 0;
  const todayAlertThreshold = plan?.dailyAlertPercentage ?? null;
  const billingFromText = formatUtcDate(billing.from);
  const billingToText = formatUtcDate(billing.to);

  const donutDashOffset =
    monthlyTokenLimit === 0
      ? DONUT_CIRCUMFERENCE
      : DONUT_CIRCUMFERENCE * (1 - Math.min(monthlyUsage / monthlyTokenLimit, 1));

  return (
    <>
      {/* Panel 1: 利用プラン情報 */}
      <div className="credit-panel">
        <p className="text-h2">{t('TENANT.PLAN_INFO')}</p>
        <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-center">
          <div className="credit-donut">
            <svg viewBox="0 0 200 200" className="w-50 h-50 -rotate-90 pointer-events-none">
              <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(21,129,154,0.2)" strokeWidth="20" />
              <circle
                data-testid="tenant-donut-progress"
                cx="100"
                cy="100"
                r="88"
                fill="none"
                stroke="var(--color-brand-primary)"
                strokeWidth="20"
                strokeDasharray={String(DONUT_CIRCUMFERENCE)}
                strokeDashoffset={String(donutDashOffset)}
                strokeLinecap="round"
              />
            </svg>
            <div className="credit-donut__center">
              <p className="text-label-small text-text-disabled">{t('TENANT.PERIOD_TOTAL')}</p>
              <div className="flex flex-col items-center gap-1">
                <p className="text-xl font-medium">{formatNumber(monthlyUsage)}</p>
                <hr className="border-border-strong w-full" />
                <p className="text-xl font-medium text-text-disabled">{formatNumber(monthlyTokenLimit)}</p>
              </div>
            </div>
          </div>
          <dl className="credit-info-list">
            <div className="credit-info-row">
              <dt className="credit-info-term">{t('TENANT.CONTRACT_PLAN')}</dt>
              <dd className="credit-info-desc">
                {planName ?? t('TENANT.PLAN_NAME')}
                <span className="credit-info-desc-note">{t('TENANT.PLAN_CHANGE_NOTE')}</span>
              </dd>
            </div>
            <div className="credit-info-row">
              <dt className="credit-info-term">{t('TENANT.BILLING_PERIOD')}</dt>
              <dd className="credit-info-desc" data-testid="tenant-billing-period">
                {t('TENANT.BILLING_PERIOD_RANGE', { from: billingFromText, to: billingToText })}
              </dd>
            </div>
            <div className="credit-info-row">
              <dt className="credit-info-term">{t('TENANT.PERIOD_STATUS')}</dt>
              <dd className="credit-info-desc">
                {formatNumber(monthlyUsage)} / {formatNumber(monthlyTokenLimit)} {t('TENANT.CREDIT_UNIT')}
                <span className="credit-info-desc-note">{t('TENANT.CREDIT_EXCEED_NOTE')}</span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {SHOW_USAGE_LIMIT_PANELS && (
        <>
          {/* Panel 2: ワークスペースの利用制限 */}
          <div className="credit-panel">
            <p className="text-h2">{t('TENANT.WS_LIMIT')}</p>
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-center">
              <dl className="credit-info-list flex-1">
                <div className="credit-info-row">
                  <dt className="credit-info-term">{t('TENANT.WS_MONTHLY_LIMIT')}</dt>
                  <dd className="credit-info-desc">
                    月合計 {formatNumber(monthlyTokenLimit)} {t('TENANT.CREDIT_UNIT')}で利用を制限
                  </dd>
                </div>
                <div className="credit-info-row">
                  <dt className="credit-info-term">{t('TENANT.WS_MONTHLY_ALERT')}</dt>
                  <dd className="credit-info-desc">{alertThreshold ? `上限の ${alertThreshold} % 到達時に通知` : '-'}</dd>
                </div>
              </dl>
              <Button variant="outline" size="lg" iconPosition="left" icon={<SvgIcon name="edit" className="icon-20 leading-none" />} onClick={() => setLimitDialog('monthly')}>
                <span>{t('TENANT.EDIT')}</span>
              </Button>
            </div>
          </div>

          {/* Panel 3: ユーザーの利用制限 */}
          <div className="credit-panel">
            <p className="text-h2">{t('TENANT.USER_LIMIT')}</p>
            <div className="flex flex-col md:flex-row gap-6 md:gap-10 items-center">
              <dl className="credit-info-list flex-1">
                <div className="credit-info-row">
                  <dt className="credit-info-term">{t('TENANT.USER_DAILY_LIMIT')}</dt>
                  <dd className="credit-info-desc">
                    1人あたり 1日 {formatNumber(todayLimit)} {t('TENANT.CREDIT_UNIT')}で利用を制限
                  </dd>
                </div>
                <div className="credit-info-row">
                  <dt className="credit-info-term">{t('TENANT.USER_DAILY_ALERT')}</dt>
                  <dd className="credit-info-desc">
                    {todayAlertThreshold ? `上限の ${todayAlertThreshold} % 到達時にユーザーに通知` : '-'}
                  </dd>
                </div>
              </dl>
              <Button variant="outline" size="lg" iconPosition="left" icon={<SvgIcon name="edit" className="icon-20 leading-none" />} onClick={() => setLimitDialog('daily')}>
                <span>{t('TENANT.EDIT')}</span>
              </Button>
            </div>
          </div>
        </>
      )}

      {/* 今月の利用履歴 */}
      <div className="flex flex-col gap-6">
        <div className="md:flex md:items-center md:justify-between gap-4">
          <p className="text-h2 shrink-0">{t('TENANT.MONTHLY_HISTORY')}</p>
          <div className="library-filters">
            <div className="library-filter-group">
              <span className="library-filter-label">{t('TENANT.FILTER')}</span>
              <div className="library-filter-selects">
                <Select
                  className="md:w-40 w-full"
                  size="small"
                  options={userOptions}
                  placeholder={t('COMMON.PLACEHOLDERS.ALL_USERS')}
                  onSelectionChange={(value) => setUserFilter(value ?? '')}
                />
              </div>
            </div>
            <div className="library-filter-group">
              <span className="library-filter-label">{t('TENANT.SORT_LABEL')}</span>
              <div className="library-filter-selects">
                <FormSortInput
                  size="sm"
                  className="w-full md:w-40"
                  placeholder="TENANT.SORT_DEFAULT"
                  fields={USAGE_SORT_FIELDS}
                  selectedField={sortField}
                  selectedOrder={sortOrder}
                  testidPrefix="tenant-usage-sort"
                  onFieldChange={(field) => setSort(field, sortOrder)}
                  onOrderChange={(order) => setSort(sortField, order)}
                />
              </div>
            </div>
            <div className="library-page-info">
              <span className="library-page-count" data-testid="tenant-usage-count">
                {pageRangeStart}-{pageRangeEnd}件 / {usageHistoryTotal}件
              </span>
              <div className="library-page-arrows">
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="library-page-arrow"
                    disabled={page <= 1}
                    aria-label={t('COMMON.FIRST_PAGE')}
                    onClick={() => setPage(1)}
                  >
                    <SvgIcon name="firstPage" className="w-5 h-5 text-text-weak" />
                  </button>
                  <button
                    type="button"
                    className="library-page-arrow"
                    disabled={page <= 1}
                    aria-label={t('COMMON.PREV_PAGE')}
                    onClick={() => setPage(page - 1)}
                  >
                    <SvgIcon name="arrowLeft" className="w-5 h-5 text-text-weak" />
                  </button>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="library-page-arrow"
                    disabled={page >= totalPagesUsage}
                    aria-label={t('COMMON.NEXT_PAGE')}
                    onClick={() => setPage(page + 1)}
                  >
                    <SvgIcon name="arrowRight" className="w-5 h-5 text-text-weak" />
                  </button>
                  <button
                    type="button"
                    className="library-page-arrow"
                    disabled={page >= totalPagesUsage}
                    aria-label={t('COMMON.LAST_PAGE')}
                    onClick={() => setPage(totalPagesUsage)}
                  >
                    <SvgIcon name="lastPage" className="w-5 h-5 text-text-weak" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="workspace-usage-table">
          <div className="workspace-usage-row workspace-usage-row--header">
            <span className="workspace-usage-col workspace-usage-col--date">{t('TENANT.HISTORY_DATE')}</span>
            <span className="workspace-usage-col workspace-usage-col--amount">{t('TENANT.HISTORY_AMOUNT')}</span>
            <span className="workspace-usage-col workspace-usage-col--user">{t('TENANT.HISTORY_USER')}</span>
          </div>
          {/* 表の高さを固定して、読み込み中の表示のずれを防ぐ */}
          <div className="relative min-h-105 md:min-h-52.5">
            {usageHistoryFetching ? (
              <div className="absolute inset-0 flex items-center justify-center" data-testid="tenant-usage-loading">
                <CircularLoading />
              </div>
            ) : (
              <>
                {usageHistoryData.map((item) => (
                  <div key={item.id} className="workspace-usage-row" data-testid="tenant-usage-row">
                    <div className="workspace-usage-col workspace-usage-col--date">
                      <span className="workspace-usage-label">{t('TENANT.HISTORY_DATE')}</span>
                      <span className="workspace-usage-value">{formatUsageDateTime(item.datetime)}</span>
                    </div>
                    <div className="workspace-usage-col workspace-usage-col--amount">
                      <span className="workspace-usage-label">{t('TENANT.HISTORY_AMOUNT')}</span>
                      <span className="workspace-usage-value">{formatNumber(item.amount)}</span>
                    </div>
                    <div className="workspace-usage-col workspace-usage-col--user">
                      <span className="workspace-usage-label">{t('TENANT.HISTORY_USER')}</span>
                      <span className="workspace-usage-value">{item.user}</span>
                    </div>
                  </div>
                ))}
                {usageHistoryData.length === 0 && (
                  <div className="flex items-center justify-center h-full min-h-105 md:min-h-52.5 text-text-muted">
                    {t('TENANT.NO_DATA')}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {usageHistoryTotal > 0 && (
          <div className="flex justify-center">
            <Pagination
              totalPages={totalPagesUsage}
              useQueryParams={false}
              showPageSize={false}
              showFirstLast={false}
              currentPageOverride={page}
              onPageChange={setPage}
            />
          </div>
        )}
      </div>

      {limitDialog && <UsageLimitDialog mode={limitDialog} plan={plan} onClose={() => setLimitDialog(null)} />}
    </>
  );
}
