import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import type { SelectOption } from '@/components/shared/types';
import type { TemplateSortField, TemplateSortOrder } from '@/types/admin/template.types';

export interface TemplateFilterChange {
  query: string;
  team: string;
  sortField: TemplateSortField;
  sortOrder: TemplateSortOrder;
}

export const TEAM_FILTER_ALL = '__all__';
export const TEAM_FILTER_NONE = '__none__';

interface TemplateListFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  /** `GET /api/admin/groups` のグループ名。「全ての所属チーム」「所属チームなし」は中で先頭に足す */
  teams: string[];
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: TemplateFilterChange) => void;
}

/** 移植元 `<app-template-list-filter>`。検索・チーム絞り込み・並べ替えと、上のページ送り */
export function TemplateListFilter({
  pageIndex,
  totalPages,
  countDisplay,
  teams,
  onPageIndexChange,
  onFilterChange,
}: TemplateListFilterProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [sortField, setSortField] = useState<TemplateSortField>(null);
  const [sortOrder, setSortOrder] = useState<TemplateSortOrder>(null);

  const teamOptions = useMemo<SelectOption[]>(
    () => [
      { value: TEAM_FILTER_ALL, label: t('TEMPLATES.ALL_TEAMS') },
      { value: TEAM_FILTER_NONE, label: t('TEMPLATES.NO_TEAM') },
      ...teams.map((team) => ({ value: team, label: team })),
    ],
    [teams, t],
  );

  const sortFieldOptions = useMemo<SortOption[]>(
    () => [
      { value: 'updatedAt', label: 'TEMPLATES.SORT_BY_UPDATED' },
      { value: 'name', label: 'TEMPLATES.SORT_BY_NAME' },
    ],
    [],
  );

  const sortOrderOptions = useMemo<SortOption[]>(
    () => [
      { value: 'asc', label: 'TEMPLATES.SORT_ASC' },
      { value: 'desc', label: 'TEMPLATES.SORT_DESC' },
    ],
    [],
  );

  // 移植元は 4 つの値をまとめて通知する。state の更新を待たず、変えた値だけ差し替えて渡す
  const emit = (change: Partial<TemplateFilterChange>) => {
    onFilterChange({
      query: searchQuery,
      team: filterTeam,
      sortField,
      sortOrder,
      ...change,
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleTeamChange = (value: string | null) => {
    const team = value ?? TEAM_FILTER_ALL;
    setFilterTeam(team);
    emit({ team });
  };

  const handleSortFieldChange = (value: string | null) => {
    const field = (value as TemplateSortField) ?? 'updatedAt';
    setSortField(field);
    emit({ sortField: field });
  };

  const handleSortOrderChange = (value: string | null) => {
    const order = value as TemplateSortOrder;
    setSortOrder(order);
    emit({ sortOrder: order });
  };

  return (
    <div className="library-filters">
      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="library-filter-label">{t('TEMPLATES.SEARCH_LABEL')}</span>
        <SearchInput
          className="md:w-40 w-full"
          size="small"
          value={searchQuery}
          placeholder="TEMPLATES.SEARCH_PLACEHOLDER"
          onValueChange={handleSearchChange}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <span className="library-filter-label">{t('TEMPLATES.FILTER_LABEL')}</span>
        <Select
          className="md:w-40 w-full"
          size="small"
          options={teamOptions}
          value={filterTeam}
          onValueChange={handleTeamChange}
          placeholder={t('TEMPLATES.ALL_TEAMS')}
        />
      </div>

      <div className="library-filter-group">
        <label htmlFor="template-list-sort" className="library-filter-label">
          {t('TEMPLATES.SORT_LABEL')}
        </label>
        <div className="library-filter-group">
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
