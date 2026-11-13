import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog } from '@/components/shared/dialog';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import { TableList, TableListItem } from '@/components/shared/table-list';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption } from '@/components/shared/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  useAssistantList,
  useAssistantOptions,
  useDeleteAssistants,
  type AssistantOptions,
} from '@/hooks/use-assistant-list';
import { ApiError } from '@/lib/api-client';
import { useAssistantListStore } from '@/store/assistant-list-store';
import type {
  AssistantApiItem,
  AssistantSortField,
  AssistantSortOrder,
} from '@/types/admin/assistant.types';
import { AssistantFormDialog } from './assistant-form-dialog';
import { AssistantListActions } from './assistant-list-actions';
import { AssistantRowMenu } from './assistant-row-menu';
import {
  ASSISTANT_SERVER_OPTIONS,
  NO_CATEGORY_OPTION,
  NO_TEAM_OPTION,
  formatCountDisplay,
} from './assistant-list.constants';

const HTTP_CONFLICT = 409;
const DIALOG_WIDTH = '800px';

const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'ADMIN.ASSISTANT.SORT_UPDATED_AT' },
  { value: 'name', label: 'ADMIN.ASSISTANT.SORT_DISPLAY_NAME' },
  { value: 'includeHistory', label: 'ADMIN.ASSISTANT.SORT_HISTORY' },
];

/** 選択肢の取得が終わる前にダイアログを開いたとき用（移植元は空の選択肢のまま開く） */
const EMPTY_OPTIONS: AssistantOptions = {
  categoriesOptions: [NO_CATEGORY_OPTION],
  groupOptions: [NO_TEAM_OPTION],
  serverApiOptions: {},
  modelOptions: {},
  folderOptions: [],
};

/** 追加・編集のダイアログの状態。null は閉じている */
type FormDialogState = { assistant?: AssistantApiItem } | null;

/** 移植元 `displayItem`。選択肢から値のラベルを引く（なければ空） */
function displayItem(value: string, options: SelectOption[]): string {
  return options.find((option) => option.value === value)?.label || '';
}

interface AssistantTabProps {
  /** 選択の有無が変わったとき（モバイルで固定ボタンの高さ分だけ本文の下に余白を取るため、親に伝える） */
  onSelectionActiveChange: (active: boolean) => void;
}

/** 移植元 `AssistantTabComponent`（assistant-tab）。アシスタント一覧タブ */
export function AssistantTab({ onSelectionActiveChange }: AssistantTabProps) {
  const { t } = useTranslation();
  const toast = useToastStore();
  const { filter, updateFilter } = useAssistantListStore();

  const listQuery = useAssistantList(filter);
  const optionsQuery = useAssistantOptions();
  const deleteMutation = useDeleteAssistants();

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 他のタブから戻ったとき、絞り込みが残っているのに検索欄だけ空にならないよう、ストアの値から始める
  const [searchInput, setSearchInput] = useState(filter.search ?? '');
  const [formDialog, setFormDialog] = useState<FormDialogState>(null);
  const [deletingIds, setDeletingIds] = useState<string[] | null>(null);

  const items = useMemo(() => listQuery.data?.content ?? [], [listQuery.data]);
  const totalItems = listQuery.data?.totalElements ?? 0;
  const totalPages = Math.ceil(totalItems / filter.pageSize);
  const options = optionsQuery.data;
  const categoriesOptions = useMemo(
    () => options?.categoriesOptions ?? [NO_CATEGORY_OPTION],
    [options],
  );
  const groupOptions = useMemo(() => options?.groupOptions ?? [NO_TEAM_OPTION], [options]);
  const serverApiOptions = options?.serverApiOptions;

  const allSelected = items.length > 0 && selectedIds.length === items.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  useEffect(() => {
    onSelectionActiveChange(selectedIds.length > 0);
  }, [selectedIds.length, onSelectionActiveChange]);

  // 検索は入力が止まってから反映する（移植元は debounceTime(300) + distinctUntilChanged）
  const debouncedSearch = useDebouncedValue(searchInput);
  useEffect(() => {
    if (debouncedSearch === (filter.search ?? '')) return;
    updateFilter({ search: debouncedSearch, pageIndex: 0 });
  }, [debouncedSearch, filter.search, updateFilter]);

  // 最後のページの行をすべて消したとき、存在しないページに留まらないよう最終ページへ戻す
  useEffect(() => {
    if (listQuery.isSuccess && !listQuery.isFetching && totalPages > 0 && filter.pageIndex >= totalPages) {
      updateFilter({ pageIndex: totalPages - 1 });
    }
  }, [listQuery.isSuccess, listQuery.isFetching, totalPages, filter.pageIndex, updateFilter]);

  // backend は接続先の表示名（label）を返さないため、接続先 API の選択肢から引く
  const modelLabel = (item: AssistantApiItem): string => {
    const endpoint = item.endpoints[0];
    if (!endpoint) return '';
    return (
      endpoint.label ||
      serverApiOptions?.[item.type]?.find((option) => option.value === endpoint.id)?.label ||
      ''
    );
  };

  const handleSortChange = (field: string | null, order: string | null) => {
    updateFilter({
      sortField: (field ?? undefined) as AssistantSortField | undefined,
      sortOrder: (order ?? undefined) as AssistantSortOrder | undefined,
    });
  };

  const toggleSelected = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((selected) => selected !== id)));

  const submitDelete = async () => {
    if (!deletingIds) return;
    try {
      await deleteMutation.mutateAsync(deletingIds);
      setSelectedIds((prev) => prev.filter((id) => !deletingIds.includes(id)));
      toast.success(t('ADMIN.ASSISTANT.DELETE_ASSISTANT_SUCCESS'));
      setDeletingIds(null);
    } catch (error) {
      console.error(error);
      if (error instanceof ApiError && error.status === HTTP_CONFLICT) {
        toast.error(t('ADMIN.ASSISTANT.DELETE_ASSISTANT_DEFAULT_CONFLICT'));
      } else {
        toast.error(t('ADMIN.ASSISTANT.DELETE_FAILED'));
      }
    }
  };

  const openDialog = (assistant?: AssistantApiItem) => setFormDialog({ assistant });

  return (
    <>
      <AssistantListActions
        selectedCount={selectedIds.length}
        createLabelKey="ADMIN.ASSISTANT.CREATE_ASSISTANT"
        onCreate={() => openDialog()}
        onDeselectAll={() => setSelectedIds([])}
        onDeleteSelected={() => setDeletingIds(selectedIds)}
      />

      <div className="library-filters">
        <div className="library-filter-group">
          <span className="library-filter-label">{t('ADMIN.LIBRARY.SEARCH_LABEL')}</span>
          <SearchInput
            size="small"
            value={searchInput}
            placeholder="ADMIN.LIBRARY.SEARCH_PLACEHOLDER"
            className="library-combobox"
            onValueChange={setSearchInput}
          />
        </div>

        <div className="library-filter-group">
          <span className="library-filter-label">{t('ADMIN.LIBRARY.FILTER_LABEL')}</span>
          <div className="library-filter-selects">
            <Select
              placeholder={t('ADMIN.ASSISTANT.ALL_CONNECTION_SERVERS')}
              options={ASSISTANT_SERVER_OPTIONS}
              value={filter.filterServer || null}
              size="small"
              className="library-combobox"
              onValueChange={(value) => updateFilter({ filterServer: value ?? undefined })}
            />
            <Select
              placeholder={t('ADMIN.ASSISTANT.ALL_CATEGORIES')}
              options={categoriesOptions}
              value={filter.filterCategory || null}
              size="small"
              className="library-combobox"
              onValueChange={(value) => updateFilter({ filterCategory: value ?? undefined })}
            />
            <Select
              placeholder={t('ADMIN.ASSISTANT.ALL_TEAMS')}
              options={groupOptions}
              value={filter.filterTeam || null}
              size="small"
              className="library-combobox"
              onValueChange={(value) => updateFilter({ filterTeam: value ?? undefined })}
            />
          </div>
        </div>

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
              onFieldChange={(field) => handleSortChange(field, filter.sortOrder ?? 'desc')}
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
          indeterminate={!allSelected && someSelected}
          className="hidden md:flex"
          onCheckedChange={(checked) => setSelectedIds(checked ? items.map((item) => item.id) : [])}
          actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
        >
          <span className="table-list-col-content table-list-label">
            {t('ADMIN.ASSISTANT.DISPLAY_NAME')}
          </span>
          <span className="table-list-col-date table-list-label md:w-20">
            {t('ADMIN.ASSISTANT.CONNECT_SERVER')}
          </span>
          <span className="table-list-col-date table-list-label md:w-30">
            {t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL')}
          </span>
          <span className="table-list-col-date table-list-label md:w-40">
            {t('ADMIN.ASSISTANT.CATEGORY')}
          </span>
          <span className="table-list-col-date table-list-label md:w-40">
            {t('ADMIN.ASSISTANT.TEAM_TERM')}
          </span>
          <span className="table-list-col-date table-list-label md:w-16">
            {t('ADMIN.ASSISTANT.HISTORY_SEND')}
          </span>
        </TableListItem>

        {items.map((item) => {
          const categories = item.categories ?? (item.category ? [item.category] : []);
          return (
            <TableListItem
              key={item.id}
              showCheckbox
              checked={selectedIds.includes(item.id)}
              onCheckedChange={(checked) => toggleSelected(item.id, checked)}
              actions={
                <div className="relative">
                  <AssistantRowMenu
                    editLabelKey="ADMIN.ASSISTANT.EDIT_ASSISTANT"
                    testid={`assistant-menu-${item.id}`}
                    onEdit={() => openDialog(item)}
                    onDelete={() => setDeletingIds([item.id])}
                  />
                </div>
              }
            >
              <div className="table-list-col-content table-list-start-label">
                <p className="table-list-title text-label-large md:text-label-x-large">{item.name}</p>
                {item.description && <p className="table-list-desc">{item.description}</p>}
              </div>

              <div className="table-list-row-date md:w-20">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('ASSISTANT.CONNECT_SERVER')}
                </span>
                <span className="table-list-date flex-1 w-20 md:w-auto font-medium">
                  {displayItem(item.type, ASSISTANT_SERVER_OPTIONS)}
                </span>
              </div>

              <div className="table-list-row-date md:w-30">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('ADMIN.ASSISTANT.GENERATIVE_AI_MODEL')}
                </span>
                <span className="table-list-date flex-1 w-30 md:w-auto text-body-small md:text-body text-text-strong">
                  {modelLabel(item)}
                </span>
              </div>

              <div className="table-list-row-date md:w-40">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('ADMIN.ASSISTANT.CATEGORY')}
                </span>
                <div className="flex-1 w-30 md:w-auto text-[0px]">
                  {categories.map((category) => (
                    <span
                      key={category.id}
                      className="assistant-tag font-medium leading-[1.4] inline-flex items-baseline rounded p-1 border border-gray-400 text-[10px] text-text-medium"
                    >
                      {category.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="table-list-row-date md:w-40">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('ADMIN.ASSISTANT.TEAM_TERM')}
                </span>
                <div className="flex-1 flex flex-col gap-1 w-30 md:w-full">
                  <span className="table-list-date font-medium">
                    {item.groups.map((groupId) => displayItem(groupId, groupOptions)).join(', ')}
                  </span>
                </div>
              </div>

              <div className="table-list-row-date md:w-16">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t('ADMIN.ASSISTANT.HISTORY_SEND')}
                </span>
                <span className="table-list-date flex-1 w-30 md:w-auto font-medium">
                  {item.includeHistory ? 'ON' : 'OFF'}
                </span>
              </div>
            </TableListItem>
          );
        })}

        {items.length === 0 && !listQuery.isFetching && (
          <div className="px-4 py-8 text-center text-text-muted">
            {t('ADMIN.ASSISTANT.ASSISTANT_NO_DATA')}
          </div>
        )}
      </TableList>

      <div className="flex justify-center mt-6">
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
        <AssistantFormDialog
          assistant={formDialog.assistant}
          options={options ?? EMPTY_OPTIONS}
          onClose={() => setFormDialog(null)}
        />
      )}

      <Dialog
        open={deletingIds !== null}
        title={t('ADMIN.ASSISTANT.DELETE_ASSISTANT_TITLE')}
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
          {t('ADMIN.ASSISTANT.DELETE_ASSISTANT_MESSAGE')}
        </p>
      </Dialog>
    </>
  );
}
