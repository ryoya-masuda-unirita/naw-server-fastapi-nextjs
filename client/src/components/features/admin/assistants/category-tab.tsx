import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { useToastStore } from '@/components/shared/toast-store';
import { useAssistantCategories, useDeleteAssistantCategories } from '@/hooks/use-assistant-list';
import { useAssistantListStore } from '@/store/assistant-list-store';
import type {
  AssistantCategoryApiItem,
  AssistantCategoryFilter,
  AssistantCategorySortField,
  AssistantCategorySortOrder,
} from '@/types/admin/assistant.types';
import { AssistantListActions } from './assistant-list-actions';
import { AssistantRowMenu } from './assistant-row-menu';
import { CategoryFormDialog } from './category-form-dialog';
import { formatCountDisplay } from './assistant-list.constants';

const DIALOG_WIDTH = '800px';

const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'ADMIN.ASSISTANT.SORT_UPDATED_AT' },
  { value: 'name', label: 'ADMIN.ASSISTANT.SORT_CATEGORY_NAME' },
];

const pad = (value: number) => String(value).padStart(2, '0');

/** 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。値がない・日付でないときは空 */
function formatLocalDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 追加・編集のダイアログの状態。null は閉じている */
type FormDialogState = { category?: AssistantCategoryApiItem } | null;

/**
 * 移植元 `AssistantCategoryListStore.applyFilter`。API はカテゴリを全件返すため、並べ替えとページ分けは画面側で行う。
 * 並べ替えの項目・順が未指定なら、更新日時の降順になる。
 */
function applyFilter(
  all: AssistantCategoryApiItem[],
  filter: AssistantCategoryFilter,
): AssistantCategoryApiItem[] {
  const { sortField, sortOrder, pageIndex, pageSize } = filter;
  const sorted = [...all].sort((a, b) => {
    const aValue = sortField === 'name' ? a.name : a.updatedAt;
    const bValue = sortField === 'name' ? b.name : b.updatedAt;
    if (aValue === bValue) return 0;
    const comparison = aValue > bValue ? 1 : -1;
    return sortOrder === 'asc' ? comparison : -comparison;
  });
  return sorted.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
}

interface CategoryTabProps {
  /** 選択の有無が変わったとき（モバイルで固定ボタンの高さ分だけ本文の下に余白を取るため、親に伝える） */
  onSelectionActiveChange: (active: boolean) => void;
}

/** 移植元 `CategoryTabComponent`（category-tab）。カテゴリ管理タブ */
export function CategoryTab({ onSelectionActiveChange }: CategoryTabProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const { categoryFilter: filter, updateCategoryFilter: updateFilter } = useAssistantListStore();

  const listQuery = useAssistantCategories();
  const deleteMutation = useDeleteAssistantCategories();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formDialog, setFormDialog] = useState<FormDialogState>(null);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);

  const allItems = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const items = useMemo(() => applyFilter(allItems, filter), [allItems, filter]);
  const totalItems = allItems.length;
  const totalPages = Math.ceil(totalItems / filter.pageSize);

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    onSelectionActiveChange(selectedIds.length > 0);
  }, [selectedIds.length, onSelectionActiveChange]);

  // 最後のページの行をすべて消したとき、存在しないページに留まらないよう最終ページへ戻す
  useEffect(() => {
    if (listQuery.isSuccess && totalPages > 0 && filter.pageIndex >= totalPages) {
      updateFilter({ pageIndex: totalPages - 1 });
    }
  }, [listQuery.isSuccess, totalPages, filter.pageIndex, updateFilter]);

  const handleSortChange = (field: string | null, order: string | null) => {
    updateFilter({
      sortField: (field ?? undefined) as AssistantCategorySortField | undefined,
      sortOrder: (order ?? undefined) as AssistantCategorySortOrder | undefined,
    });
  };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((selected) => selected !== id)));

  const submitDelete = async () => {
    if (!deletingIds) return;
    try {
      await deleteMutation.mutateAsync(deletingIds);
      setSelectedIds((prev) => prev.filter((id) => !deletingIds.includes(id)));
      toast.success(t('ADMIN.ASSISTANT.DELETE_CATEGORY_SUCCESS'));
      setDeletingIds(null);
    } catch (error) {
      console.error(error);
      toast.error(t('ADMIN.ASSISTANT.DELETE_CATEGORY_FAILED'));
    }
  };

  return (
    <>
      <AssistantListActions
        selectedCount={selectedIds.length}
        createLabelKey="ADMIN.ASSISTANT.CREATE_CATEGORY"
        onCreate={() => setFormDialog({})}
        onDeselectAll={() => setSelectedIds([])}
        onDeleteSelected={() => setDeletingIds(selectedIds)}
      />

      <div className="library-filters">
        <div className="library-filter-group">
          <span className="library-filter-label">{t('ADMIN.LIBRARY.SORT_LABEL')}</span>
          <div className="library-filter-selects">
            <FormSortInput
              size="sm"
              fields={SORT_FIELD_OPTIONS}
              selectedField={filter.sortField ?? null}
              selectedOrder={filter.sortOrder ?? null}
              placeholder="ADMIN.ASSISTANT.SORT_UPDATED_AT"
              className="library-combobox library-sort-wrap"
              onFieldChange={(field) => handleSortChange(field, filter.sortOrder ?? null)}
              onOrderChange={(order) => handleSortChange(filter.sortField ?? null, order)}
            />
          </div>
        </div>

        <div className="library-page-info">
          <Pagination
            showPageSize={false}
            showPageNumbers={false}
            useQueryParams={false}
            countDisplay={formatCountDisplay(filter.pageIndex, filter.pageSize, totalItems)}
            totalPages={totalPages}
            currentPageOverride={filter.pageIndex + 1}
            onPageChange={(page) => updateFilter({ pageIndex: page - 1 })}
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
          onCheckedChange={(checked) => setSelectedIds(checked ? items.map((item) => item.id) : [])}
          actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
        >
          <span className="table-list-col-date table-list-label md:w-30">
            {t('ADMIN.ASSISTANT.UPDATED_AT')}
          </span>
          <span className="table-list-col-content table-list-label">
            {t('ADMIN.ASSISTANT.CATEGORY_NAME')}
          </span>
        </TableListItem>

        <TableListItem
          isHeader
          showCheckbox
          checked={allSelected}
          indeterminate={someSelected}
          className="flex md:hidden"
          onCheckedChange={(checked) => setSelectedIds(checked ? items.map((item) => item.id) : [])}
        >
          <span className="table-list-label">{t('COMMON.SELECT_ALL')}</span>
        </TableListItem>

        {items.map((item) => (
          <TableListItem
            key={item.id}
            showCheckbox
            checked={selectedIds.includes(item.id)}
            onCheckedChange={(checked) => toggleSelected(item.id, checked)}
            actions={
              <div className="relative">
                <AssistantRowMenu
                  editLabelKey="ADMIN.ASSISTANT.EDIT_CATEGORY"
                  testid={`category-menu-${item.id}`}
                  onEdit={() => setFormDialog({ category: item })}
                  onDelete={() => setDeletingIds([item.id])}
                />
              </div>
            }
          >
            <div className="table-list-col-date md:w-30">
              <span className="table-list-date font-medium">
                {formatLocalDateTime(item.updatedAt)}
              </span>
            </div>

            <div className="table-list-col-content">
              <p className="table-list-title text-label-large md:text-label-x-large">{item.name}</p>
              <p className="table-list-desc">{item.description}</p>
            </div>
          </TableListItem>
        ))}

        {items.length === 0 && !listQuery.isFetching && (
          <div className="px-4 py-8 text-center text-text-muted">
            {t('ADMIN.ASSISTANT.CATEGORY_NO_DATA')}
          </div>
        )}
      </TableList>

      <div className="flex justify-center">
        <Pagination
          totalPages={totalPages}
          useQueryParams={false}
          showPageSize={false}
          showFirstLast={false}
          currentPageOverride={filter.pageIndex + 1}
          onPageChange={(page) => updateFilter({ pageIndex: page - 1 })}
        />
      </div>

      {formDialog && (
        <CategoryFormDialog category={formDialog.category} onClose={() => setFormDialog(null)} />
      )}

      <Dialog
        open={deletingIds !== null}
        title={t('ADMIN.ASSISTANT.DELETE_CATEGORY_TITLE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        confirmMinWidth="min-w-30.5"
        buttonAlign="center"
        confirmLoading={deleteMutation.isPending}
        dialogWidth={DIALOG_WIDTH}
        onConfirm={() => void submitDelete()}
        onClose={() => setDeletingIds(null)}
      >
        <p className="modal-delete-confirm-message pt-1">
          {t('ADMIN.ASSISTANT.DELETE_CATEGORY_MESSAGE')}
        </p>
      </Dialog>
    </>
  );
}
