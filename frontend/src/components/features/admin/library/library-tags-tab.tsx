import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/shared/button';
import { Dialog } from '@/components/shared/dialog';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Pagination } from '@/components/shared/pagination';
import { Skeleton } from '@/components/shared/skeleton';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { useAdminTagList, useDeleteTags } from '@/hooks/use-library-tags';
import { TAGS_PAGE_SIZE, useLibraryTagsStore } from '@/store/library-tags-store';
import type { TagItem } from '@/types/admin/library.types';
import { calcTotalPages, formatCountDisplay, formatDateTime } from './library-format';
import { TagEditSettingsDialog } from './tag-edit-settings-dialog';
import { TagItemMenu } from './tag-item-menu';

const DEFAULT_SORT_FIELD = 'updatedAt';
const DEFAULT_SORT_ORDER = 'desc';
const DIALOG_WIDTH = '800px';
const SKELETON_ROWS = [1, 2, 3, 4, 5];
const SORT_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'ADMIN.LIBRARY.TAGS.SORT_UPDATED_AT' },
  { value: 'name', label: 'ADMIN.LIBRARY.TAGS.SORT_NAME' },
];

/** タグの編集ダイアログの状態。null は閉じている。`tag` がなければ新規作成 */
type EditDialogState = { tag?: TagItem } | null;

/** 移植元 `TagsTabComponent`（`<app-library-tags-tab>`）。タグ管理タブ（テナント管理者のみ） */
export function LibraryTagsTab() {
  const { t } = useTranslation();
  const store = useLibraryTagsStore();
  const { sortBy, sortOrder, page } = store;

  const listQuery = useAdminTagList({
    page: page - 1,
    size: TAGS_PAGE_SIZE,
    sort: `${sortBy || DEFAULT_SORT_FIELD},${sortOrder || DEFAULT_SORT_ORDER}`,
  });
  const deleteMutation = useDeleteTags();

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [editDialog, setEditDialog] = useState<EditDialogState>(null);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);

  // 画面（タブ）を離れたらページ・並べ替えを捨てる。残すと、初期表示の並べ替え欄と実際の条件がずれる
  useEffect(() => store.reset, [store.reset]);

  const items = useMemo(() => listQuery.data?.content ?? [], [listQuery.data]);
  const totalElements = listQuery.data?.totalElements ?? 0;
  const totalPages = calcTotalPages(totalElements, TAGS_PAGE_SIZE);
  const countDisplay = formatCountDisplay(page, TAGS_PAGE_SIZE, totalElements);

  const selectedCount = items.filter((tag) => selectedIds.has(tag.id)).length;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const hasSelection = selectedIds.size > 0;

  const toggleItem = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(items.map((tag) => tag.id)) : new Set());
  };
  const clearSelection = () => setSelectedIds(new Set());

  // ページ・並べ替えを変えたら選択は解除する（移植元と同じ）
  const handlePageChange = (next: number) => {
    clearSelection();
    store.changePage(next);
  };
  const handleSortChange = (value: string | null) => {
    clearSelection();
    store.changeSort(value ?? '');
  };
  const handleOrderChange = (value: string | null) => {
    clearSelection();
    store.changeSortOrder(value ?? DEFAULT_SORT_ORDER);
  };

  const submitDelete = async () => {
    if (!deletingIds) return;
    const ids = deletingIds;
    // 移植元は確認を押した時点でダイアログを閉じてから削除する
    setDeletingIds(null);
    try {
      await deleteMutation.mutateAsync(ids);
      setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す（このタブは個別のトーストを持たない。移植元と同じ）
    }
  };

  const deleteSelected = () => setDeletingIds([...selectedIds]);

  const addButton = (
    <Button
      variant="solid"
      size="lg"
      iconPosition="left"
      fullWidth
      className="w-50.5 items-center"
      icon={<SvgIcon name="addCircle" className="text-xl!" />}
      onClick={() => setEditDialog({})}
    >
      <span>{t('ADMIN.LIBRARY.TAGS.ADD')}</span>
    </Button>
  );

  return (
    <>
      <div
        className={`flex flex-col gap-8 p-4 pb-28! md:gap-6 md:px-6! md:py-6! overflow-auto ${
          hasSelection ? 'max-h-[calc(100vh-150px)]' : 'max-h-[calc(100vh-105px)]'
        }`}
      >
        <div className="hidden md:flex items-start">
          {hasSelection ? (
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                className="w-36"
                fullWidth
                intent="cancel"
                size="md"
                heightPx={54}
                onClick={clearSelection}
              >
                {t('GROUPS.CLEAR_SELECTION')}
              </Button>
              <Button
                variant="outline"
                className="w-30"
                fullWidth
                intent="delete"
                size="md"
                heightPx={54}
                onClick={deleteSelected}
              >
                <div className="flex items-center gap-1 justify-center leading-normal">
                  <AppMatIcon icon="delete" className="text-xl! leading-none" />
                  <span>{t('COMMON.DELETE')}</span>
                </div>
              </Button>
            </div>
          ) : (
            addButton
          )}
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
          <div className="flex flex-col gap-1 items-start w-full md:w-auto">
            <span className="text-label font-medium text-text-medium">
              {t('ADMIN.LIBRARY.TAGS.SORT_LABEL')}
            </span>
            <FormSortInput
              size="sm"
              fields={SORT_OPTIONS}
              selectedField={sortBy || null}
              selectedOrder={sortOrder}
              placeholder={t('ADMIN.LIBRARY.TAGS.SORT_UPDATED_AT')}
              className="w-full md:w-40"
              onFieldChange={handleSortChange}
              onOrderChange={handleOrderChange}
            />
          </div>

          <div className="flex justify-center md:justify-end">
            <Pagination
              totalPages={totalPages}
              useQueryParams={false}
              showPageSize={false}
              showPageNumbers={false}
              currentPageOverride={page}
              countDisplay={countDisplay}
              onPageChange={handlePageChange}
            />
          </div>
        </div>

        <TableList>
          <TableListItem
            isHeader
            showCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            className="hidden md:flex"
            onCheckedChange={toggleAll}
            actions={<span className="w-9 h-9 invisible" />}
          >
            <span className="table-list-label shrink-0 w-30">
              {t('ADMIN.LIBRARY.TAGS.HEADER_UPDATED_AT')}
            </span>
            <span className="table-list-col-content table-list-label">
              {t('ADMIN.LIBRARY.TAGS.HEADER_NAME')}
            </span>
          </TableListItem>

          <TableListItem
            isHeader
            showCheckbox
            checked={allSelected}
            indeterminate={someSelected}
            className="flex md:hidden"
            onCheckedChange={toggleAll}
          >
            <span className="table-list-label">{t('COMMON.SELECT_ALL')}</span>
          </TableListItem>

          {listQuery.isFetching
            ? SKELETON_ROWS.map((row) => (
                <TableListItem key={row} showCheckbox>
                  <div className="shrink-0 w-30 max-sm:w-auto flex flex-col gap-1">
                    <Skeleton height="14px" width="80px" />
                  </div>
                  <div className="table-list-col-content flex flex-col gap-1">
                    <Skeleton height="16px" width="120px" />
                    <Skeleton height="14px" width="200px" />
                  </div>
                </TableListItem>
              ))
            : items.map((item) => (
                <TableListItem
                  key={item.id}
                  showCheckbox
                  checked={selectedIds.has(item.id)}
                  onCheckedChange={(checked) => toggleItem(item.id, checked)}
                  actions={
                    <TagItemMenu
                      item={item}
                      onEditSettings={(tag) => setEditDialog({ tag })}
                      onDeleteItem={(tag) => setDeletingIds([tag.id])}
                    />
                  }
                >
                  <div className="shrink-0 w-30 max-sm:w-auto flex flex-col gap-0.5">
                    <p className="font-roboto font-medium text-label text-text-medium truncate">
                      {formatDateTime(item.updatedAt)}
                    </p>
                  </div>

                  <div className="table-list-col-content">
                    <p className="table-list-title text-label-large md:text-label-x-large">
                      {item.name}
                    </p>
                    <p className="table-list-desc">{item.description || '-'}</p>
                  </div>
                </TableListItem>
              ))}

          {!listQuery.isFetching && items.length === 0 && (
            <div className="px-8 py-16 text-center text-text-muted">{t('COMMON.NO_DATA')}</div>
          )}
        </TableList>

        <div className="flex justify-center">
          <Pagination
            totalPages={totalPages}
            useQueryParams={false}
            showPageSize={false}
            showFirstLast={false}
            currentPageOverride={page}
            onPageChange={handlePageChange}
          />
        </div>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-bg-primary border-t border-border-weak shadow-lg z-10">
        {hasSelection ? (
          <div className="flex flex-col gap-3">
            <Button variant="outline" fullWidth intent="delete" size="lg" onClick={deleteSelected}>
              <div className="flex items-center gap-1 justify-center">
                <AppMatIcon icon="delete" className="text-xl! leading-none" />
                <span>{t('COMMON.DELETE')}</span>
              </div>
            </Button>
            <Button variant="outline" fullWidth intent="cancel" size="lg" onClick={clearSelection}>
              {t('GROUPS.CLEAR_SELECTION')}
            </Button>
          </div>
        ) : (
          <Button
            variant="solid"
            size="lg"
            fullWidth
            className="w-full"
            onClick={() => setEditDialog({})}
          >
            <MatIcon name="add_circle" size={20} />
            <span className="ml-1">{t('ADMIN.LIBRARY.TAGS.ADD')}</span>
          </Button>
        )}
      </div>

      {editDialog && <TagEditSettingsDialog tag={editDialog.tag} onClose={() => setEditDialog(null)} />}

      <Dialog
        open={deletingIds !== null}
        title={t('ADMIN.LIBRARY.TAGS.DELETE.TITLE')}
        message={t('ADMIN.LIBRARY.TAGS.DELETE.MESSAGE')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('COMMON.DELETE')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        buttonAlign="center"
        dialogWidth={DIALOG_WIDTH}
        onConfirm={() => void submitDelete()}
        onCancel={() => setDeletingIds(null)}
        onClose={() => setDeletingIds(null)}
      />
    </>
  );
}
