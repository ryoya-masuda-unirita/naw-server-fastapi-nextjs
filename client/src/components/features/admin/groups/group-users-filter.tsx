import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import type { SelectOption } from '@/components/shared/types';
import type {
  GroupMemberUserSortField,
  GroupSortOrder,
  GroupUserRole,
} from '@/types/admin/group-management.types';

/** 権限の絞り込みの「すべて」（移植元 group-list.constants の ROLES.ALL） */
export const ROLE_FILTER_ALL = 'all';

export type GroupUsersRoleFilter = GroupUserRole | typeof ROLE_FILTER_ALL;

export interface GroupUsersFilterChange {
  query: string;
  role: GroupUsersRoleFilter;
  sortField: GroupMemberUserSortField;
  sortOrder: GroupSortOrder;
}

interface GroupUsersFilterProps {
  pageIndex: number;
  totalPages: number;
  countDisplay: string;
  onPageIndexChange: (page: number) => void;
  onFilterChange: (change: GroupUsersFilterChange) => void;
}

/** 移植元 `<app-group-users-filter>`。検索・権限・並べ替えと、上のページ送り */
export function GroupUsersFilter({
  pageIndex,
  totalPages,
  countDisplay,
  onPageIndexChange,
  onFilterChange,
}: GroupUsersFilterProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<GroupUsersRoleFilter>(ROLE_FILTER_ALL);
  const [sortField, setSortField] = useState<GroupMemberUserSortField>('updatedAt');
  const [sortOrder, setSortOrder] = useState<GroupSortOrder>('desc');

  const roleOptions: SelectOption[] = [
    { value: ROLE_FILTER_ALL, label: t('GROUPS.ALL_ROLES') },
    { value: 'admin', label: t('GROUPS.ROLE_ADMIN') },
    { value: 'user', label: t('GROUPS.ROLE_MEMBER') },
  ];

  const sortFieldOptions = useMemo<SortOption[]>(
    () => [
      { value: 'updatedAt', label: 'GROUPS.SORT_BY_ADDED' },
      { value: 'name', label: 'GROUPS.SORT_BY_USER_NAME' },
      { value: 'role', label: 'GROUPS.SORT_BY_ROLE' },
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

  // state の更新を待たず、変えた値だけ差し替えて 4 つの値をまとめて通知する
  const emit = (change: Partial<GroupUsersFilterChange>) => {
    onFilterChange({ query: searchQuery, role: filterRole, sortField, sortOrder, ...change });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    emit({ query: value });
  };

  const handleRoleChange = (value: string | null) => {
    const role = (value as GroupUsersRoleFilter | null) ?? ROLE_FILTER_ALL;
    setFilterRole(role);
    emit({ role });
  };

  const handleSortFieldChange = (value: string | null) => {
    const field = (value as GroupMemberUserSortField | null) ?? 'updatedAt';
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
        <span className="text-xs font-medium text-text-muted">{t('GROUPS.FILTER_LABEL')}</span>
        <Select
          className="md:w-40 w-full"
          size="small"
          options={roleOptions}
          value={filterRole}
          onValueChange={handleRoleChange}
        />
      </div>

      <div className="flex flex-col gap-1 items-start w-full md:w-auto">
        <label htmlFor="group-users-sort" className="text-xs font-medium text-text-muted">
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
