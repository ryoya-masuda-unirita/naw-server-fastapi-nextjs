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
import { Select } from '@/components/shared/select';
import { SelectWithSearch } from '@/components/shared/select-with-search';
import type { SelectOption } from '@/components/shared/types';

interface TrainingDataFiltersProps {
  query: string;
  userOptions: SelectOption[];
  selectedUser: string | null;
  periodOptions: PeriodOption[];
  selectedPeriod: string | null;
  filterPeriodRange: PeriodRange | null;
  statusOptions: SelectOption[];
  selectedStatus: string | null;
  sortOptions: SortOption[];
  sortField: string | null;
  sortOrder: string | null;
  countDisplay: string;
  totalPages: number;
  currentPage: number;
  onSearchQuery: (query: string) => void;
  onUserChange: (value: string | null) => void;
  onPeriodChange: (change: PeriodChange) => void;
  onStatusChange: (value: string | null) => void;
  onSortFieldChange: (value: string | null) => void;
  onSortOrderChange: (value: string | null) => void;
  onPageChange: (page: number) => void;
}

/** 移植元 `<app-training-data-filters>`。ファイル一覧の検索・絞り込み・並べ替え・件数とページ送り */
export function TrainingDataFilters({
  query,
  userOptions,
  selectedUser,
  periodOptions,
  selectedPeriod,
  filterPeriodRange,
  statusOptions,
  selectedStatus,
  sortOptions,
  sortField,
  sortOrder,
  countDisplay,
  totalPages,
  currentPage,
  onSearchQuery,
  onUserChange,
  onPeriodChange,
  onStatusChange,
  onSortFieldChange,
  onSortOrderChange,
  onPageChange,
}: TrainingDataFiltersProps) {
  const { t } = useTranslation();

  return (
    <div className="library-filters">
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-label font-medium text-text-muted">
          {t('LEARNING_DATA.SEARCH_LABEL')}
        </span>
        <SearchInput
          className="md:w-40 w-full"
          size="small"
          value={query}
          placeholder="LEARNING_DATA.SEARCH_PLACEHOLDER"
          dataTestid="training-data-file-search-input"
          showClearButton
          onValueChange={onSearchQuery}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-label font-medium text-text-muted">
          {t('LEARNING_DATA.FILTER_LABEL')}
        </span>
        <div className="flex flex-col md:flex-row gap-2 w-full">
          <SelectWithSearch
            className="md:w-40 w-full"
            size="small"
            options={userOptions}
            value={selectedUser === 'all' ? null : selectedUser}
            placeholder={t('LEARNING_DATA.ALL_USERS')}
            supportText={t('CHAT_HISTORY.FILTER_USER_SUPPORT')}
            testidPrefix="training-data-file-user"
            onValueChange={onUserChange}
          />
          <PeriodFilter
            className="md:w-40 w-full"
            size="small"
            options={periodOptions}
            value={selectedPeriod}
            range={filterPeriodRange}
            testidPrefix="training-data-file-period"
            onSelectionChange={onPeriodChange}
          />
          <Select
            className="md:w-40 w-full"
            size="small"
            placeholder={t('LEARNING_DATA.ALL_SETTINGS')}
            options={statusOptions}
            value={selectedStatus || null}
            onValueChange={onStatusChange}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-label font-medium text-text-muted">
          {t('LEARNING_DATA.SORT_LABEL')}
        </span>
        <FormSortInput
          className="md:w-40 w-full"
          size="sm"
          fields={sortOptions}
          selectedField={sortField}
          selectedOrder={sortOrder}
          placeholder={t('LEARNING_DATA.SORT_UPDATED_AT')}
          testidPrefix="training-data-file-sort"
          onFieldChange={onSortFieldChange}
          onOrderChange={onSortOrderChange}
        />
      </div>

      <div className="flex items-center gap-3 w-full md:ml-auto md:w-auto justify-center md:justify-end">
        <Pagination
          showPageSize={false}
          showPageNumbers={false}
          useQueryParams={false}
          showFirstLast
          countDisplay={countDisplay}
          totalPages={totalPages}
          currentPageOverride={currentPage}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  );
}
