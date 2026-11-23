import { useTranslation } from 'react-i18next';
import { Pagination } from '@/components/shared/pagination';
import { PeriodFilter } from '@/components/shared/period-filter';
import type {
  PeriodChange,
  PeriodOption,
  PeriodRange,
} from '@/components/shared/period-filter-utils';
import { SearchInput } from '@/components/shared/search-input';

interface TrainingDataFiltersProps {
  query: string;
  periodOptions: PeriodOption[];
  selectedPeriod: string | null;
  filterPeriodRange: PeriodRange | null;
  countDisplay: string;
  totalPages: number;
  currentPage: number;
  onSearchQuery: (query: string) => void;
  onPeriodChange: (change: PeriodChange) => void;
  onPageChange: (page: number) => void;
}

/** 移植元 `<app-training-data-filters>`。ファイル一覧の検索・絞り込み・件数とページ送り（並べ替えは NAW-1427 で移植元に合わせて外した） */
export function TrainingDataFilters({
  query,
  periodOptions,
  selectedPeriod,
  filterPeriodRange,
  countDisplay,
  totalPages,
  currentPage,
  onSearchQuery,
  onPeriodChange,
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
          <PeriodFilter
            className="md:w-40 w-full"
            size="small"
            options={periodOptions}
            value={selectedPeriod}
            range={filterPeriodRange}
            testidPrefix="training-data-file-period"
            onSelectionChange={onPeriodChange}
          />
        </div>
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
