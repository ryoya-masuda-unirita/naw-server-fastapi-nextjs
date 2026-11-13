import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import type { GroupSortOrder } from '@/types/admin/group-management.types';

export interface GroupTemplatesFilterChange {
  query: string;
  /** 並べ替えを選んでいないときは空文字（移植元と同じ） */
  sortField: string;
  sortOrder: GroupSortOrder;
}

interface GroupTemplatesFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: GroupTemplatesFilterChange) => void;
}

/** 移植元 `<app-group-templates-filter>`。検索・並べ替えと、上のページ送り */
export function GroupTemplatesFilter({
  pageIndex,
  totalPages,
  countDisplay,
  onPageIndexChange,
  onFilterChange,
}: GroupTemplatesFilterProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<GroupSortOrder>('desc');

  const sortFieldOptions = useMemo<SortOption[]>(
    () => [
      { value: 'addedAt', label: 'TEAM.TEMPLATE.SORT_BY_ADDED' },
      { value: 'name', label: 'TEAM.TEMPLATE.SORT_BY_NAME' },
    ],
    [],
  );

  const sortOrderOptions = useMemo<SortOption[]>(
    () => [
      { value: 'asc', label: 'COMMON.ASC' },
      { value: 'desc', label: 'COMMON.DESC' },
    ],
    [],
  );

  // state の更新を待たず、変えた値だけ差し替えて 3 つの値をまとめて通知する
  const emit = (change: Partial<{ query: string; field: string | null; order: GroupSortOrder }>) => {
    onFilterChange({
      query: change.query ?? searchQuery,
      sortField: (change.field !== undefined ? change.field : sortField) ?? '',
      sortOrder: change.order ?? sortOrder,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleSortFieldChange = (value: string | null) => {
    setSortField(value);
    emit({ field: value });
  };

  const handleSortOrderChange = (value: string | null) => {
    const order = (value ?? '') as GroupSortOrder;
    setSortOrder(order);
    emit({ order });
  };

  return (
    <div className="library-filters">
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-xs font-medium text-text-muted">{t('COMMON.SEARCH')}</span>
        <SearchInput
          className="md:w-40 w-full"
          size="small"
          value={searchQuery}
          placeholder="COMMON.SEARCH_PLACEHOLDER"
          onValueChange={handleSearchChange}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <label htmlFor="templates-sort" className="text-xs font-medium text-text-muted">
          {t('COMMON.SORT')}
        </label>
        <FormSortInput
          className="w-full md:w-40"
          size="sm"
          fields={sortFieldOptions}
          orders={sortOrderOptions}
          selectedField={sortField}
          selectedOrder={sortOrder}
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
