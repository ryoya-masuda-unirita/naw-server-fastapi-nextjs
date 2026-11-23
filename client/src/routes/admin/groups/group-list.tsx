import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GroupListFilter,
  type GroupListFilterChange,
} from '@/components/features/admin/groups/group-list-filter';
import { GroupListCards } from '@/components/features/admin/groups/group-list-cards';
import { GroupAddDialog } from '@/components/features/admin/groups/group-add-dialog';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import {
  EMPTY_LOOKUP,
  needsNameLookup,
  toViewModel,
  useGroupList,
  useHydratedGroupItems,
  useNameLookup,
} from '@/hooks/use-group-list';
import { useAuthStore } from '@/store/auth-store';
import { useGroupListStore } from '@/store/group-list-store';

/** 移植元 `GroupListComponent`（group-list）。チーム管理の一覧画面 */
export function GroupListPage() {
  const { t } = useTranslation();
  const store = useGroupListStore();
  const { filter } = store;
  const canCreateTeam = !useAuthStore((state) => state.isGroupAdminOnly);

  const listQuery = useGroupList(filter);
  // 名前が欠けて ID だけの項目があるときだけ、名前の対応表を取る。一覧の表示は、対応表の取得を待たない
  const needsLookup = (listQuery.data?.data ?? []).some(needsNameLookup);
  const lookupQuery = useNameLookup(needsLookup);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // 対応表が取れるまでは、名前のない項目は ID のまま出す。取れたら名前に置き換える（移植元と同じ）
  const baseItems = useMemo(() => {
    const lookup = lookupQuery.data ?? EMPTY_LOOKUP;
    return (listQuery.data?.data ?? []).map((item) => toViewModel(item, lookup));
  }, [listQuery.data, lookupQuery.data]);
  const items = useHydratedGroupItems(baseItems, !listQuery.isFetching);
  const totalItems = listQuery.data?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay =
    totalItems === 0 ? '' : t('GROUPS.PAGE_COUNT', { from, to, total: totalItems });

  // 画面を離れたら検索・ページを捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => store.reset, [store.reset]);

  const handleFilterChange = (event: GroupListFilterChange) => {
    store.updateFilter({
      query: event.query || undefined,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  };

  return (
    <AdminPageShell header={<PageHeader title="" titleKey="GROUPS.TITLE" />}>
      <div className="md:flex md:justify-between">
        {canCreateTeam && (
          <div className="sp-fixed-btn">
            <div>
              <Button
                variant="solid"
                size="lg"
                type="button"
                fullWidth
                className="w-full md:w-auto"
                dataTestid="admin-groups-create-button"
                onClick={() => setIsAddOpen(true)}
              >
                <SvgIcon name="addCircle" className="w-5 h-5" />
                <span>{t('GROUPS.CREATE_TEAM')}</span>
              </Button>
            </div>
          </div>
        )}

        <GroupListFilter
          pageIndex={filter.pageIndex}
          totalPages={totalPages}
          countDisplay={countDisplay}
          onPageIndexChange={store.updatePageIndex}
          onFilterChange={handleFilterChange}
        />
      </div>

      {listQuery.isFetching ? (
        <div className="flex justify-center p-8">
          <CircularLoading />
        </div>
      ) : (
        <>
          <GroupListCards items={items} />

          {totalItems > 0 && (
            <div className="flex justify-center">
              <Pagination
                totalPages={totalPages}
                useQueryParams={false}
                showPageSize={false}
                showFirstLast={false}
                currentPageOverride={filter.pageIndex}
                onPageChange={store.updatePageIndex}
              />
            </div>
          )}
        </>
      )}

      {isAddOpen && <GroupAddDialog onClose={() => setIsAddOpen(false)} />}
    </AdminPageShell>
  );
}
