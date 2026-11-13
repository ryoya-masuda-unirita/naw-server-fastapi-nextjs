import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { PeriodFilter } from '@/components/shared/period-filter';
import type {
  PeriodChange,
  PeriodOption,
  PeriodRange,
} from '@/components/shared/period-filter-utils';
import { SearchInput } from '@/components/shared/search-input';
import { SelectWithSearch } from '@/components/shared/select-with-search';
import type { SelectOption } from '@/components/shared/types';
import type { ChatHistorySortField, ChatHistorySortOrder } from '@/types/chat-history.types';

/** 移植元 `ChatHistoryFilterChange` */
export interface ChatHistoryFilterChange {
  period: string;
  periodRange: PeriodRange | null;
  user: string | null;
  query: string;
  sortField: ChatHistorySortField | null;
  sortOrder: ChatHistorySortOrder | null;
}

interface ChatHistoryFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  userOptions: SelectOption[];
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: ChatHistoryFilterChange) => void;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: '', label: 'COMMON.PERIOD_FILTER.ALL_PERIODS' },
  { value: 'today', label: 'COMMON.PERIOD_FILTER.TODAY' },
  { value: '7days', label: 'COMMON.PERIOD_FILTER.PAST_7_DAYS' },
  { value: '30days', label: 'COMMON.PERIOD_FILTER.PAST_30_DAYS' },
];

const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'CHAT_HISTORY.SORT_BY_UPDATED' },
  { value: 'userName', label: 'CHAT_HISTORY.SORT_BY_USER' },
  { value: 'roomName', label: 'CHAT_HISTORY.SORT_BY_CHAT' },
];

const SORT_ORDER_OPTIONS: SortOption[] = [
  { value: 'asc', label: 'CHAT_HISTORY.SORT_ASC' },
  { value: 'desc', label: 'CHAT_HISTORY.SORT_DESC' },
];

/** 移植元 `<app-chat-history-filter>`。検索・ユーザー・期間・並べ替えと、上のページ送り */
export function ChatHistoryFilter({
  pageIndex,
  totalPages,
  countDisplay,
  userOptions,
  onPageIndexChange,
  onFilterChange,
}: ChatHistoryFilterProps) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState('');
  const [periodRange, setPeriodRange] = useState<PeriodRange | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<ChatHistorySortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<ChatHistorySortOrder>('desc');

  // 移植元は 6 つの値をまとめて通知する。state の更新を待たず、変えた値だけ差し替えて渡す
  const emit = (change: Partial<ChatHistoryFilterChange>) => {
    onFilterChange({
      period,
      periodRange,
      user,
      query: searchQuery,
      sortField,
      sortOrder,
      ...change,
    });
  };

  const handlePeriodChange = (event: PeriodChange) => {
    setPeriod(event.value);
    setPeriodRange(event.range);
    emit({ period: event.value, periodRange: event.range });
  };

  const handleUserChange = (value: string | null) => {
    setUser(value);
    emit({ user: value });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleSortFieldChange = (value: string | null) => {
    const field = (value as ChatHistorySortField | null) ?? 'updatedAt';
    setSortField(field);
    emit({ sortField: field });
  };

  const handleSortOrderChange = (value: string | null) => {
    const order = (value as ChatHistorySortOrder | null) ?? 'desc';
    setSortOrder(order);
    emit({ sortOrder: order });
  };

  return (
    <div className="library-filters">
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-label font-medium text-text-medium">
          {t('CHAT_HISTORY.SEARCH_LABEL')}
        </span>
        <SearchInput
          className="md:w-40 w-full"
          size="small"
          value={searchQuery}
          placeholder="CHAT_HISTORY.SEARCH_PLACEHOLDER"
          dataTestid="admin-chat-history-search-input"
          onValueChange={handleSearchChange}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-label font-medium text-text-medium">
          {t('CHAT_HISTORY.FILTER_LABEL')}
        </span>
        <div className="flex flex-col md:flex-row gap-2 w-full">
          <SelectWithSearch
            className="md:w-40 w-full"
            size="small"
            options={userOptions}
            value={user}
            placeholder={t('CHAT_HISTORY.ALL_USERS')}
            supportText={t('CHAT_HISTORY.FILTER_USER_SUPPORT')}
            testidPrefix="admin-chat-history-user"
            onValueChange={handleUserChange}
          />
          <PeriodFilter
            className="md:w-40 w-full"
            size="small"
            options={PERIOD_OPTIONS}
            value={period}
            range={periodRange}
            testidPrefix="admin-chat-history-period"
            onSelectionChange={handlePeriodChange}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <label htmlFor="chat-history-sort" className="text-label font-medium text-text-medium">
          {t('CHAT_HISTORY.SORT_LABEL')}
        </label>
        <FormSortInput
          className="w-full md:w-40"
          size="sm"
          fields={SORT_FIELD_OPTIONS}
          orders={SORT_ORDER_OPTIONS}
          selectedField={sortField}
          selectedOrder={sortOrder}
          testidPrefix="admin-chat-history-sort"
          placeholder={t('CHAT_HISTORY.SORT_BY_UPDATED')}
          onFieldChange={handleSortFieldChange}
          onOrderChange={handleSortOrderChange}
        />
      </div>

      <div className="flex items-center gap-3 w-full md:ml-auto md:w-auto justify-center md:justify-end">
        <Pagination
          totalPages={totalPages}
          useQueryParams={false}
          showPageSize={false}
          showPageNumbers={false}
          currentPageOverride={pageIndex}
          countDisplay={countDisplay}
          onPageChange={onPageIndexChange}
        />
      </div>
    </div>
  );
}
