import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TEAM_FILTER_ALL,
  TEAM_FILTER_NONE,
  TemplateListFilter,
  type TemplateFilterChange,
} from '@/components/features/admin/templates/template-list-filter';
import { TemplateListItems } from '@/components/features/admin/templates/template-list-items';
import { TemplateFormDialog } from '@/components/features/admin/templates/template-form-dialog';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { Button } from '@/components/shared/button';
import { CircularLoading } from '@/components/shared/circular-loading';
import { Dialog } from '@/components/shared/dialog';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { useToastStore } from '@/components/shared/toast-store';
import {
  useDeleteTemplates,
  useGroupOptions,
  useTemplateList,
} from '@/hooks/use-template-list';
import { useTemplateListStore } from '@/store/template-list-store';
import type { AdminTemplate, TemplateApiItem } from '@/types/admin/template.types';

/** 追加・編集のダイアログの状態。null は閉じている */
type FormDialogState = { template?: AdminTemplate } | null;

function toViewModel(item: TemplateApiItem): AdminTemplate {
  return {
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    systemPrompt: item.systemPrompt ?? '',
    teams: item.groups ?? [],
    updatedAt: item.updatedAt,
  };
}

/** 移植元 `AdminTemplateListComponent`（template-list）。テンプレート管理の一覧画面 */
export function AdminTemplateListPage() {
  const { t } = useTranslation();
  const toast = useToastStore();
  const store = useTemplateListStore();
  const { filter, selectedIds } = store;

  const listQuery = useTemplateList(filter);
  const groupsQuery = useGroupOptions();
  const deleteMutation = useDeleteTemplates();

  const [formDialog, setFormDialog] = useState<FormDialogState>(null);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);

  // 取得に失敗した一覧は空として扱う（共通のエラートーストは api-client が出す）
  const items = useMemo(() => (listQuery.data?.content ?? []).map(toViewModel), [listQuery.data]);
  const totalItems = listQuery.data?.totalElements ?? 0;
  const groupOptions = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const teamFilterNames = useMemo(() => groupOptions.map((group) => group.name), [groupOptions]);

  // 表示中のページにない選択は無効（移植元は読み込み時に落とす）
  const effectiveSelectedIds = useMemo(
    () => new Set(items.filter((item) => selectedIds.has(item.id)).map((item) => item.id)),
    [items, selectedIds],
  );
  const allSelected = items.length > 0 && effectiveSelectedIds.size === items.length;
  const someSelected = effectiveSelectedIds.size > 0;

  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay =
    totalItems === 0 ? '' : t('TEMPLATES.PAGE_COUNT', { from, to, total: totalItems });

  // 画面を離れたら検索・ページ・選択を捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => store.reset, [store.reset]);

  // 最後のページの行をすべて消したとき、存在しないページに留まらないよう最終ページへ戻す
  const { updatePageIndex } = store;
  useEffect(() => {
    if (listQuery.isSuccess && !listQuery.isFetching && filter.pageIndex > totalPages) {
      updatePageIndex(totalPages);
    }
  }, [listQuery.isSuccess, listQuery.isFetching, filter.pageIndex, totalPages, updatePageIndex]);

  const handleFilterChange = (event: TemplateFilterChange) => {
    let teamId: string | undefined;
    if (event.team === TEAM_FILTER_ALL) {
      teamId = undefined;
    } else if (event.team === TEAM_FILTER_NONE) {
      // backend が「グループなし」として扱うので、そのまま渡す
      teamId = TEAM_FILTER_NONE;
    } else {
      // フィルターはグループ名を値に持つので、API へは ID に変えて渡す
      teamId = groupOptions.find((group) => group.name === event.team)?.id;
    }
    store.updateFilter({
      query: event.query || undefined,
      team: teamId,
      sortField: event.sortField,
      sortOrder: event.sortOrder,
    });
  };

  // ダイアログは開く時点で選択肢が必要なので、未取得なら取ってから開く（移植元 `loadGroups`）
  const ensureGroups = async () => {
    if (groupOptions.length === 0) await groupsQuery.refetch();
  };

  const handleAdd = async () => {
    await ensureGroups();
    setFormDialog({});
  };

  const handleEdit = async (template: AdminTemplate) => {
    await ensureGroups();
    setFormDialog({ template });
  };

  const handleDelete = (template?: AdminTemplate) => {
    const ids = template ? [template.id] : [...effectiveSelectedIds];
    if (ids.length === 0) return;
    setDeletingIds(ids);
  };

  const submitDelete = async () => {
    if (!deletingIds) return;
    try {
      await deleteMutation.mutateAsync(deletingIds);
      store.clearSelection();
      toast.success(t('TEMPLATES.DELETE_SUCCESS'));
      setDeletingIds(null);
    } catch {
      toast.error(t('TEMPLATES.DELETE_FAILED'));
    }
  };

  return (
    <AdminPageShell
      header={<PageHeader title="" titleKey="TEMPLATES.TITLE" showActions={false} showBackButton={false} />}
      mainClass={someSelected ? 'pb-[153px] md:pb-0' : 'pb-[87px] md:pb-0'}
    >
      <div className="sp-fixed-btn">
        {someSelected ? (
          <div className="flex flex-col-reverse md:flex-row gap-3">
            <Button
              variant="outline"
              intent="cancel"
              size="lg"
              type="button"
              classProps="w-full"
              onClick={store.clearSelection}
            >
              {t('TEMPLATES.DESELECT')}
            </Button>
            <Button
              variant="outline"
              intent="delete"
              size="lg"
              type="button"
              classProps="w-full"
              onClick={() => handleDelete()}
            >
              <SvgIcon name="delete" className="w-5 h-5" />
              {t('TEMPLATES.DELETE_SELECTED')}
            </Button>
          </div>
        ) : (
          <div>
            <Button
              variant="solid"
              size="lg"
              type="button"
              fullWidth
              className="w-full md:w-auto"
              onClick={() => void handleAdd()}
            >
              <SvgIcon name="addCircle" className="w-5 h-5" />
              {t('TEMPLATES.ADD_TEMPLATE')}
            </Button>
          </div>
        )}
      </div>

      <TemplateListFilter
        pageIndex={filter.pageIndex}
        totalPages={totalPages}
        countDisplay={countDisplay}
        teams={teamFilterNames}
        onPageIndexChange={store.updatePageIndex}
        onFilterChange={handleFilterChange}
      />

      {listQuery.isFetching ? (
        <div className="flex justify-center p-8">
          <CircularLoading />
        </div>
      ) : (
        <>
          <TemplateListItems
            items={items}
            selectedIds={effectiveSelectedIds}
            allSelected={allSelected}
            someSelected={someSelected}
            onSelectAllChange={(checked) =>
              store.toggleSelectAll(
                checked,
                items.map((item) => item.id),
              )
            }
            onItemSelectChange={store.toggleSelected}
            onEditTemplate={(template) => void handleEdit(template)}
            onDeleteTemplate={handleDelete}
          />

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

      {formDialog && (
        <TemplateFormDialog
          template={formDialog.template}
          groupOptions={groupOptions}
          onClose={() => setFormDialog(null)}
        />
      )}

      <Dialog
        open={deletingIds !== null}
        title={t('TEMPLATES.DELETE_TEMPLATE_TITLE')}
        confirmText={t('COMMON.DELETE')}
        cancelText={t('COMMON.CANCEL')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        confirmLoading={deleteMutation.isPending}
        onConfirm={() => void submitDelete()}
        onClose={() => setDeletingIds(null)}
      >
        <p className="modal-delete-confirm-message -mt-2 md:mt-1">
          {t('TEMPLATES.DELETE_TEMPLATE_MESSAGE')}
        </p>
      </Dialog>
    </AdminPageShell>
  );
}
