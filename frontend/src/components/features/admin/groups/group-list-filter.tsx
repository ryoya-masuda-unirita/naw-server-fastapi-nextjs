import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import type { GroupSortField, GroupSortOrder } from '@/types/admin/group-management.types';

export interface GroupListFilterChange {
  query: string;
  sortField: GroupSortField;
  sortOrder: GroupSortOrder;
}

interface GroupListFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: GroupListFilterChange) => void;
}

/** 移植元 `<app-group-list-filter>`。検索・並べ替えと、上のページ送り */
export function GroupListFilter({
  pageIndex,
  totalPages,
  countDisplay,
  onPageIndexChange,
  onFilterChange,
}: GroupListFilterProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<GroupSortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<GroupSortOrder>('desc');

  const sortFieldOptions = useMemo<SortOption[]>(
    () => [
      { value: 'updatedAt', label: 'GROUPS.SORT_BY_UPDATED' },
      { value: 'name', label: 'GROUPS.SORT_BY_NAME' },
    ],
    [],
  );

  const sortOrderOptions = useMemo<SortOption[]>(
    () => [
      { value: 'asc', label: 'GROUPS.SORT_ASC' },
      { value: 'desc', label: 'GROUPS.SORT_DESC' },
    ],
    [],
  );

  // state の更新を待たず、変えた値だけ差し替えて 3 つの値をまとめて通知する
  const emit = (change: Partial<GroupListFilterChange>) => {
    onFilterChange({ query: searchQuery, sortField, sortOrder, ...change });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleSortFieldChange = (value: string | null) => {
    const field = (value as GroupSortField) ?? 'updatedAt';
    setSortField(field);
    emit({ sortField: field });
  };

  const handleSortOrderChange = (value: string | null) => {
    const order = (value ?? '') as GroupSortOrder;
    setSortOrder(order);
    emit({ sortOrder: order });
  };

  return (
    <div className="library-filters">
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="text-xs font-medium text-text-muted">{t('GROUPS.SEARCH_LABEL')}</span>
        <SearchInput
          className="md:w-40 w-full"
          size="small"
          value={searchQuery}
          placeholder="GROUPS.SEARCH_PLACEHOLDER"
          onValueChange={handleSearchChange}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <label htmlFor="group-list-sort" className="text-xs font-medium text-text-muted">
          {t('GROUPS.SORT_LABEL')}
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
