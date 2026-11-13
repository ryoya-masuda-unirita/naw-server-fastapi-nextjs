import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppMatIcon } from '@/components/shared/icons/app-mat-icon';
import { Dialog } from '@/components/shared/dialog';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { Select } from '@/components/shared/select';
import { Skeleton } from '@/components/shared/skeleton';
import { Table } from '@/components/shared/table';
import { useToastStore } from '@/components/shared/toast-store';
import type { SelectOption, TableColumn } from '@/components/shared/types';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  useDeleteLibrary,
  useLibraryList,
  useLibraryTagOptions,
  useUserProfileId,
} from '@/hooks/use-library-list';
import { ROUTES } from '@/lib/constants/routes';
import {
  LIBRARY_PAGE_SIZE,
  useLibraryListStore,
  type LibraryUserFilterMode,
} from '@/store/library-list-store';
import { useAuthStore } from '@/store/auth-store';
import type { LibraryPageItem } from '@/types/admin/library.types';
import { LibraryEditSettingsDialog } from './library-edit-settings-dialog';
import { LibraryItemMenu } from './library-item-menu';
import { calcTotalPages, copyText, formatCountDisplay, formatDateTime } from './library-format';

const DEFAULT_SORT_FIELD = 'updatedAt';
const DIALOG_WIDTH = '800px';
const SKELETON_ROWS = [1, 2, 3, 4, 5];

// 並べ替え項目の文言は移植元でもハードコード（i18n キーではなく、そのまま表示される）
const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: '更新日時順' },
  { value: 'title', label: 'コンテンツ名順' },
];

/** 移植元 `ContentTabComponent`（`<app-library-content-tab>`）。ライブラリのコンテンツ一覧タブ */
export function LibraryContentTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToastStore();
  const store = useLibraryListStore();
  const { title, userMode, tagId, sortField, sortOrder, page } = store;
  const loginId = useAuthStore((state) => state.user?.id ?? '');
  const profileId = useUserProfileId();

  const tagsQuery = useLibraryTagOptions();
  const tagOptions = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data]);
  const listQuery = useLibraryList({
    page: page - 1,
    size: LIBRARY_PAGE_SIZE,
    title: title || undefined,
    createdBy: userMode === 'mine' ? loginId : undefined,
    excludeCreatedBy: userMode === 'others' ? loginId : undefined,
    tagIds: tagId ? [tagId] : undefined,
    sortBy: sortField || DEFAULT_SORT_FIELD,
    sortDir: sortOrder || undefined,
  });
  const deleteMutation = useDeleteLibrary();

  const [searchInput, setSearchInput] = useState('');
  const [editingItem, setEditingItem] = useState<LibraryPageItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<LibraryPageItem | null>(null);

  // 画面（タブ）を離れたら絞り込み・ページを捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => store.reset, [store.reset]);

  // 検索は 300ms 待ってから反映する（移植元 `debounceTime(300)`）。入力が変わっていなければ何もしない
  const debouncedSearch = useDebouncedValue(searchInput);
  const { changeTitle } = store;
  useEffect(() => {
    if (debouncedSearch !== useLibraryListStore.getState().title) changeTitle(debouncedSearch);
  }, [debouncedSearch, changeTitle]);

  const items = listQuery.data?.content ?? [];
  const totalElements = listQuery.data?.totalElements ?? 0;
  const totalPages = calcTotalPages(totalElements, LIBRARY_PAGE_SIZE);
  const countDisplay = formatCountDisplay(page, LIBRARY_PAGE_SIZE, totalElements);

  // 最終ページの最後の 1 件を削除すると現在のページが範囲外になるため、最終ページへ戻す（移植元 `deleteItem`）
  const { changePage } = store;
  useEffect(() => {
    if (listQuery.isSuccess && !listQuery.isFetching && page > totalPages) changePage(totalPages);
  }, [listQuery.isSuccess, listQuery.isFetching, page, totalPages, changePage]);

  const userFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('ADMIN.LIBRARY.ALL_USERS') },
      { value: 'mine', label: t('ADMIN.LIBRARY.ONLY_MINE') },
      { value: 'others', label: t('ADMIN.LIBRARY.ONLY_OTHERS') },
    ],
    [t],
  );
  const tagFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('ADMIN.LIBRARY.ALL_TAGS') },
      ...tagOptions.map((tag) => ({ value: tag.id, label: tag.name })),
    ],
    [tagOptions, t],
  );

  const isOwner = (item: LibraryPageItem) => !!item.userId && item.userId === profileId;

  const submitDelete = async () => {
    if (!deletingItem || deleteMutation.isPending) return;
    try {
      await deleteMutation.mutateAsync(deletingItem.id);
      setDeletingItem(null);
    } catch {
      // 共通のエラートーストは skipGlobalErrorToast で止めているので、画面側で出す（移植元と同じ）
      toast.error(t('ADMIN.LIBRARY.DELETE_FAILED'));
    }
  };

  const columns: TableColumn<LibraryPageItem>[] = [
    {
      field: 'title',
      header: 'コンテンツ名',
      hasBorder: true,
      render: (row) => (
        <div className="table-list-col-content table-list-start-label">
          <span className="table-list-title text-label-large md:text-label-x-large">{row.title}</span>
        </div>
      ),
    },
    {
      field: 'tags',
      header: 'タグ',
      width: 'w-82.5',
      render: (row) => (
        <div className="library-tags">
          {row.tags.map((tag) => (
            <span key={tag.id} className="library-tag">
              <span className="library-tag-hash">#</span>
              {tag.name}
            </span>
          ))}
        </div>
      ),
    },
    {
      field: 'updatedAt',
      header: '更新日時',
      width: 'w-30',
      render: (row) => (
        <div className="table-list-row-date md:w-30 font-medium!">
          <span className="table-list-date flex-1 w-30 md:w-auto">{formatDateTime(row.updatedAt)}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-8 p-4 md:gap-6 md:p-6 overflow-auto max-h-[calc(100vh-105px)] md:max-h-[calc(100vh-115px)]">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
          <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
            <div className="flex flex-col gap-1 items-start w-full md:w-auto">
              <span className="text-label font-medium text-text-medium">
                {t('ADMIN.LIBRARY.SEARCH_LABEL')}
              </span>
              <SearchInput
                size="small"
                value={searchInput}
                placeholder="ADMIN.LIBRARY.SEARCH_PLACEHOLDER"
                dataTestid="library-search-input"
                onValueChange={setSearchInput}
              />
            </div>

            <div className="flex flex-col gap-1 items-start w-full md:w-auto">
              <span className="text-label font-medium text-text-medium">
                {t('ADMIN.LIBRARY.FILTER_LABEL')}
              </span>
              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                <Select
                  options={userFilterOptions}
                  value={userMode || null}
                  placeholder={t('ADMIN.LIBRARY.ALL_USERS')}
                  size="small"
                  supportText={t('ADMIN.LIBRARY.FILTER_USER_SUPPORT')}
                  className="md:w-40 w-full"
                  onValueChange={(value) => store.changeUserMode((value ?? '') as LibraryUserFilterMode)}
                />
                <Select
                  options={tagFilterOptions}
                  value={tagId || null}
                  placeholder={t('ADMIN.LIBRARY.ALL_TAGS')}
                  size="small"
                  className="md:w-40 w-full"
                  onValueChange={(value) => store.changeTagId(value ?? '')}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1 items-start">
              <label htmlFor="library-sort" className="text-label font-medium text-text-medium">
                {t('ADMIN.LIBRARY.SORT_LABEL')}
              </label>
              <FormSortInput
                size="sm"
                fields={SORT_FIELD_OPTIONS}
                selectedField={sortField}
                selectedOrder={sortOrder}
                placeholder={t('ADMIN.LIBRARY.SORT_PLACEHOLDER')}
                className="w-full md:w-40"
                onFieldChange={(value) => store.changeSort(value, sortOrder)}
                onOrderChange={(value) => store.changeSort(sortField, value)}
              />
            </div>
          </div>

          <div className="flex gap-3 items-center justify-center">
            <Pagination
              totalPages={totalPages}
              useQueryParams={false}
              showPageSize={false}
              showPageNumbers={false}
              currentPageOverride={page}
              countDisplay={countDisplay}
              onPageChange={store.changePage}
            />
          </div>
        </div>

        {listQuery.isFetching ? (
          <div className="flex flex-col gap-2" data-testid="library-skeleton">
            {SKELETON_ROWS.map((row) => (
              <div
                key={row}
                className="flex items-center gap-4 px-4 py-3 border border-border-weak rounded-lg"
              >
                <Skeleton height="40px" width="40px" rounded="rounded-lg" />
                <div className="flex flex-col gap-1 flex-1">
                  <Skeleton height="16px" width="160px" />
                  <Skeleton height="14px" width="100px" />
                </div>
                <Skeleton height="14px" width="80px" className="hidden md:block" />
                <Skeleton height="14px" width="60px" className="hidden md:block" />
              </div>
            ))}
          </div>
        ) : (
          <Table
            data={items}
            columns={columns}
            actionsWidth="w-31"
            rowTestid="library-content-item"
            renderActions={(row) => (
              <div className="flex items-center justify-center flex-col md:flex-row gap-2">
                <LibraryItemMenu
                  item={row}
                  isOwner={isOwner(row)}
                  onEditSettings={setEditingItem}
                  onCopyLink={(item) =>
                    copyText(`${window.location.origin}${ROUTES.APP.LIBRARY_DETAIL(item.id)}`)
                  }
                  onDeleteItem={setDeletingItem}
                />
                <button
                  type="button"
                  data-testid={`library-detail-${row.id}`}
                  className="flex items-center justify-center p-1 md:p-2! rounded-full hover:bg-bg-brand-weak transition-colors"
                  onClick={(event) => {
                    event.stopPropagation();
                    void navigate(ROUTES.APP.LIBRARY_DETAIL(row.id));
                  }}
                >
                  <AppMatIcon
                    icon="chevron_right"
                    className="text-text-weak text-xl! leading-none transition-colors"
                  />
                </button>
              </div>
            )}
          />
        )}

        <div className="flex justify-center">
          <Pagination
            totalPages={totalPages}
            useQueryParams={false}
            showPageSize={false}
            showFirstLast={false}
            currentPageOverride={page}
            onPageChange={store.changePage}
          />
        </div>
      </div>

      {editingItem && (
        <LibraryEditSettingsDialog
          item={editingItem}
          tagOptions={tagOptions}
          onClose={() => setEditingItem(null)}
        />
      )}

      <Dialog
        open={deletingItem !== null}
        title={t('ADMIN.LIBRARY.DELETE.TITLE')}
        message={t('ADMIN.LIBRARY.DELETE.MESSAGE')}
        cancelText={t('COMMON.CANCEL')}
        confirmText={t('COMMON.DELETE')}
        showCancel
        showConfirm
        confirmDanger
        confirmIcon="delete"
        buttonAlign="center"
        dialogWidth={DIALOG_WIDTH}
        onConfirm={() => void submitDelete()}
        onCancel={() => setDeletingItem(null)}
        onClose={() => setDeletingItem(null)}
      />
    </>
  );
}
