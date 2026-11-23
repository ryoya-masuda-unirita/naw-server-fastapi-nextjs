import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ASSISTANT_SERVER_TYPE } from '@/components/features/admin/assistants/assistant-list.constants';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import type { SelectOption } from '@/components/shared/types';
import { useAssistantCategories } from '@/hooks/use-assistant-list';
import type { GroupSortOrder } from '@/types/admin/group-management.types';

export interface GroupAssistantsFilterChange {
  query: string;
  typeFilter: string;
  categoryFilter: string;
  /** 並べ替えを選んでいないときは空文字（移植元と同じ） */
  sortField: string;
  sortOrder: GroupSortOrder;
}

interface GroupAssistantsFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: GroupAssistantsFilterChange) => void;
}

/** 移植元 `<app-group-assistants-filter>`。検索・接続サーバー・カテゴリ・並べ替えと、上のページ送り */
export function GroupAssistantsFilter({
  pageIndex,
  totalPages,
  countDisplay,
  onPageIndexChange,
  onFilterChange,
}: GroupAssistantsFilterProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<GroupSortOrder>('desc');

  // 取得に失敗したらカテゴリの選択肢は「すべて」だけにする（移植元の catch と同じ）
  const categoriesQuery = useAssistantCategories();

  const typeOptions: SelectOption[] = [
    { value: '', label: t('TEAM.ASSISTANT.ALL_SERVERS') },
    { value: ASSISTANT_SERVER_TYPE.SECURE, label: t('TEAM.ASSISTANT.SERVER_LOCAL') },
    { value: ASSISTANT_SERVER_TYPE.SAAS_CHAT, label: t('TEAM.ASSISTANT.SERVER_CLOUD_GENERAL') },
    { value: ASSISTANT_SERVER_TYPE.SAAS_RAG, label: t('TEAM.ASSISTANT.SERVER_CLOUD_SPECIFIED') },
  ];

  const categoryOptions: SelectOption[] = [
    { value: '', label: t('TEAM.ASSISTANT.ALL_CATEGORIES') },
    ...(categoriesQuery.data ?? []).map((category) => ({
      value: category.id,
      label: category.name,
    })),
  ];

  const sortFieldOptions = useMemo<SortOption[]>(
    () => [
      { value: 'addedAt', label: 'TEAM.ASSISTANT.SORT_BY_ADDED' },
      { value: 'name', label: 'TEAM.ASSISTANT.SORT_BY_NAME' },
      { value: 'server', label: 'TEAM.ASSISTANT.SORT_BY_SERVER' },
      { value: 'category', label: 'TEAM.ASSISTANT.SORT_BY_CATEGORY' },
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

  // state の更新を待たず、変えた値だけ差し替えて 5 つの値をまとめて通知する
  const emit = (
    change: Partial<{
      query: string;
      type: string;
      category: string;
      field: string | null;
      order: GroupSortOrder;
    }>,
  ) => {
    onFilterChange({
      query: change.query ?? searchQuery,
      typeFilter: change.type ?? typeFilter,
      categoryFilter: change.category ?? categoryFilter,
      sortField: (change.field !== undefined ? change.field : sortField) ?? '',
      sortOrder: change.order ?? sortOrder,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleTypeChange = (value: string) => {
    setTypeFilter(value);
    emit({ type: value });
  };

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    emit({ category: value });
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
        <span className="text-xs font-medium text-text-muted">{t('COMMON.FILTER')}</span>
        <div className="flex gap-2">
          <Select
            className="md:w-40 w-full"
            size="small"
            options={typeOptions}
            value={typeFilter}
            onSelectionChange={handleTypeChange}
          />
          <Select
            className="md:w-40 w-full"
            size="small"
            options={categoryOptions}
            value={categoryFilter}
            onSelectionChange={handleCategoryChange}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <label htmlFor="assistants-sort" className="text-xs font-medium text-text-muted">
          {t('COMMON.SORT')}
        </label>
        <FormSortInput
          className="w-full md:w-40"
          size="sm"
          placeholder="TEAM.ASSISTANT.SORT_BY_ADDED"
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
