import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  GroupTemplatesFilter,
  type GroupTemplatesFilterChange,
} from '@/components/features/admin/groups/group-templates-filter';
import { GroupTemplatesTable } from '@/components/features/admin/groups/group-templates-table';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { FormCombobox, type ComboboxOption } from '@/components/shared/form-combobox';
import { MatIcon } from '@/components/shared/icons/mat-icon';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { Pagination } from '@/components/shared/pagination';
import { useToastStore } from '@/components/shared/toast-store';
import {
  fetchAddTemplateOptions,
  useAddGroupTemplates,
  useGroupTemplates,
  useRemoveGroupTemplates,
} from '@/hooks/use-group-templates';
import { useGroupTemplatesStore } from '@/store/group-templates-store';
import type { GroupTemplateSortField } from '@/types/admin/group-management.types';

/** 移植元 GroupDetailTemplatesComponent（`/admin/groups/:id/templates`）。所属テンプレートのタブ */
export function GroupDetailTemplatesPage() {
  const { t } = useTranslation();
  const toast = useToastStore();
  const groupId = useParams().id ?? '';
  const { filter, selectedIds, updateFilter, updatePageIndex, toggleSelected, toggleSelectAll } =
    useGroupTemplatesStore();
  const clearSelection = useGroupTemplatesStore((state) => state.clearSelection);
  const reset = useGroupTemplatesStore((state) => state.reset);

  const { data, isFetching } = useGroupTemplates(groupId, filter);
  const addTemplates = useAddGroupTemplates(groupId);
  const removeTemplates = useRemoveGroupTemplates(groupId);

  const [addOptions, setAddOptions] = useState<ComboboxOption[] | null>(null);
  const [addSelection, setAddSelection] = useState<string[]>([]);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);

  // 画面を離れる・別のグループへ移ったら条件と選択を捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => reset, [groupId, reset]);

  // 読み込みに失敗したときは一覧を空にする（移植元の store と同じ）
  const items = data?.items ?? [];
  const totalItems = data?.totalElements ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay =
    totalItems === 0 ? '' : t('GROUPS.PAGE_COUNT', { from, to, total: totalItems });

  // 読み込んだページにないテンプレートの選択は無いものとして扱う（移植元は読み込みのたびに選択を絞り込む）
  const selectedItems = items.filter((item) => selectedIds.has(item.id));
  const someSelected = selectedItems.length > 0;
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  const handleFilterChange = (event: GroupTemplatesFilterChange) => {
    updateFilter({
      search: event.query || undefined,
      sortField: (event.sortField as GroupTemplateSortField) || undefined,
      sortOrder: event.sortOrder,
    });
  };

  const handleOpenAdd = async () => {
    setAddSelection([]);
    setAddOptions(await fetchAddTemplateOptions(groupId));
  };

  const handleAddSubmit = async () => {
    if (addTemplates.isPending || addSelection.length === 0) return;
    try {
      await addTemplates.mutateAsync(addSelection);
      toast.success(t('GROUPS.ADD_TEMPLATE_SUCCESS'));
      setAddOptions(null);
    } catch {
      toast.error(t('GROUPS.ADD_TEMPLATE_FAILED'));
    }
  };

  /** id を渡せばその 1 件、渡さなければ選択中のすべて */
  const handleDelete = (id?: string) => {
    const ids = id ? [id] : Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeletingIds(ids);
  };

  const handleDeleteSubmit = async () => {
    if (!deletingIds || removeTemplates.isPending) return;
    try {
      await removeTemplates.mutateAsync(deletingIds);
      clearSelection();
      toast.success(t('GROUPS.DELETE_TEMPLATE_SUCCESS'));
      setDeletingIds(null);
    } catch {
      toast.error(t('GROUPS.DELETE_TEMPLATE_FAILED'));
    }
  };

  return (
    <>
      <div className="flex flex-col grow min-h-0 gap-8 md:gap-6 py-4 md:py-6">
        {/* 操作バー（モバイルでは下に固定） */}
        <div className="sp-fixed-btn">
          {someSelected ? (
            <div className="flex flex-col-reverse md:flex-row gap-3">
              <Button variant="outline" intent="cancel" size="lg" type="button" onClick={clearSelection}>
                {t('COMMON.DESELECT')}
              </Button>
              <Button
                variant="outline"
                intent="delete"
                size="lg"
                type="button"
                onClick={() => handleDelete()}
              >
                <MatIcon name="delete" size={20} />
                {t('TEAM.TEMPLATE.REMOVE_FROM_TEAM')}
              </Button>
            </div>
          ) : (
            <Button
              variant="solid"
              size="lg"
              type="button"
              fullWidth
              className="w-full md:w-auto"
              dataTestid="admin-groups-add-template-button"
              onClick={() => void handleOpenAdd()}
            >
              <SvgIcon className="w-5 h-5" name="add_circle" />
              {t('TEAM.TEMPLATE.ADD_TEMPLATE')}
            </Button>
          )}
        </div>

        <GroupTemplatesFilter
          pageIndex={filter.pageIndex}
          totalPages={totalPages}
          countDisplay={countDisplay}
          onPageIndexChange={updatePageIndex}
          onFilterChange={handleFilterChange}
        />

        {isFetching ? (
          <div className="flex justify-center p-8">
            <CircularLoading />
          </div>
        ) : (
          <>
            <GroupTemplatesTable
              items={items}
              selectedIds={selectedIds}
              allSelected={allSelected}
              someSelected={someSelected}
              onSelectAllChange={(checked) =>
                toggleSelectAll(
                  checked,
                  items.map((item) => item.id),
                )
              }
              onItemSelectChange={toggleSelected}
              onDeleteItem={handleDelete}
            />

            {totalItems > 0 && (
              <div className="flex justify-center">
                <Pagination
                  totalPages={totalPages}
                  currentPageOverride={filter.pageIndex}
                  useQueryParams={false}
                  showPageSize={false}
                  showFirstLast={false}
                  onPageChange={updatePageIndex}
                />
              </div>
            )}
          </>
        )}
      </div>

      {addOptions && (
        <Dialog
          open
          title={t('GROUPS.ADD_TEMPLATE')}
          confirmText={t('GROUPS.ADD_TEMPLATE_SUBMIT')}
          cancelText={t('COMMON.CANCEL')}
          showCancel
          showConfirm
          buttonAlign="right"
          confirmDisabled={addSelection.length === 0}
          dialogWidth="100%"
          panelClass="term-main-dialog"
          onConfirm={() => void handleAddSubmit()}
          onClose={() => setAddOptions(null)}
        >
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-default leading-[1.4] mb-2">
              {t('GROUPS.TEMPLATES_LABEL')}
            </span>
            <p className="text-xs text-text-muted leading-[1.4]">
              {t('GROUPS.ADD_TEMPLATE_SUPPORT')}
            </p>
            <FormCombobox
              label=""
              value={addSelection}
              options={addOptions}
              placeholder={t('GROUPS.TEMPLATES_PLACEHOLDER')}
              onValueChange={setAddSelection}
            />
          </div>
        </Dialog>
      )}

      <Dialog
        open={deletingIds !== null}
        title={t('GROUPS.DELETE_TEMPLATE_TITLE')}
        message={t('GROUPS.DELETE_TEMPLATE_MESSAGE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        confirmIcon="delete"
        showCancel
        showConfirm
        confirmDanger
        buttonAlign="center"
        onConfirm={() => void handleDeleteSubmit()}
        onClose={() => setDeletingIds(null)}
      />
    </>
  );
}
