import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toTrainingDataItem } from '@/components/features/admin/training-data/training-data-api-normalize';
import { TrainingFolderAddDialog } from '@/components/features/admin/training-data/training-folder-add-dialog';
import { Button } from '@/components/shared/button';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { SvgIcon } from '@/components/shared/icons/svg-icon';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { SearchInput } from '@/components/shared/search-input';
import { useTrainingDataList } from '@/hooks/use-training-data';
import { ROUTES } from '@/lib/constants/routes';
import { useTrainingDataStore } from '@/store/training-data-store';
import type { TrainingDataSortField, TrainingDataSortOrder } from '@/types/training-data.types';

/** 移植元 `TRAINING_DATA_SORT_OPTIONS`。並べ替えの方向は FormSortInput の既定（昇順・降順）を使う */
const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'LEARNING_DATA.SORT_UPDATED_AT' },
  { value: 'name', label: 'LEARNING_DATA.SORT_FOLDER_NAME' },
  { value: 'type', label: 'LEARNING_DATA.SORT_SERVER' },
];

/** 移植元 `TrainingDataComponent`（training-data）。学習データの一覧（学習先フォルダのカード） */
export function TrainingDataPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useTrainingDataStore();
  const { filter } = store;
  const listQuery = useTrainingDataList(filter);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // 移植元は画面の signal に持つ。並べ替えは最初どちらも未選択（API には既定の更新日時の降順が送られる）
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<TrainingDataSortField | null>(null);
  const [sortDir, setSortDir] = useState<TrainingDataSortOrder | null>(null);

  const items = useMemo(
    () => (listQuery.data?.data ?? []).map(toTrainingDataItem),
    [listQuery.data],
  );
  const totalItems = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  // 移植元でも日本語の固定文字列（辞書にキーがない）
  const countDisplay = totalItems === 0 ? '' : `${from}-${to}件 / ${totalItems}件`;

  // 画面を離れたら検索・ページを捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => store.reset, [store.reset]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    store.updateFilter({ query: query || undefined });
  };

  const handleSortFieldChange = (field: string | null) => {
    setSortField(field as TrainingDataSortField | null);
    store.updateFilter({ sortField: (field as TrainingDataSortField) || undefined });
  };

  const handleSortOrderChange = (dir: string | null) => {
    setSortDir(dir as TrainingDataSortOrder | null);
    store.updateFilter({ sortOrder: (dir ?? '') as TrainingDataSortOrder });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title=""
        titleKey="LEARNING_DATA.LEARNING_DATA"
        showSidebarToggle
        showActions={false}
        showLanguageToggle
        showBackButton={false}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main
          className="flex flex-col gap-0 md:gap-6 flex-1 min-w-0 min-h-0 overflow-y-auto px-4 pt-4 pb-6 md:px-6 md:pt-6"
          data-learning-main
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 md:gap-6">
            <Button
              variant="solid"
              size="lg"
              iconPosition="left"
              fullWidth
              className="hidden! md:flex! md:w-auto items-center self-start"
              icon={<SvgIcon name="addCircle" />}
              dataTestid="admin-training-data-create-button"
              onClick={() => setIsCreateOpen(true)}
            >
              <span>{t('LEARNING_DATA.CREATE_NEW_FOLDER')}</span>
            </Button>

            <div className="flex flex-col md:flex-row justify-end items-start md:items-end gap-3 md:gap-6 w-full md:w-auto">
              <div className="flex flex-col gap-1 w-full md:w-40">
                <label
                  htmlFor="library-search"
                  className="font-medium text-xs leading-[1.4] text-text-muted"
                >
                  {t('LEARNING_DATA.SEARCH_LABEL')}
                </label>
                <SearchInput
                  className="w-full"
                  size="small"
                  value={searchQuery}
                  placeholder="LEARNING_DATA.SEARCH_PLACEHOLDER"
                  dataTestid="admin-training-data-search-input"
                  onValueChange={handleSearch}
                />
              </div>

              <div className="flex flex-col gap-1 w-full md:w-40">
                <label
                  htmlFor="library-sort"
                  className="font-medium text-xs leading-[1.4] text-text-muted"
                >
                  {t('LEARNING_DATA.SORT_LABEL')}
                </label>
                <FormSortInput
                  className="w-full"
                  size="sm"
                  fields={SORT_FIELD_OPTIONS}
                  placeholder={t(SORT_FIELD_OPTIONS[0].label)}
                  selectedField={sortField}
                  selectedOrder={sortDir}
                  testidPrefix="admin-training-data-sort"
                  onFieldChange={handleSortFieldChange}
                  onOrderChange={handleSortOrderChange}
                />
              </div>

              <div className="flex w-full justify-center md:w-auto md:block">
                <Pagination
                  totalPages={totalPages}
                  useQueryParams={false}
                  showPageSize={false}
                  showPageNumbers={false}
                  showFirstLast
                  currentPageOverride={filter.pageIndex}
                  countDisplay={countDisplay}
                  onPageChange={store.updatePageIndex}
                />
              </div>
            </div>
          </div>

          <div className="term-cards text-text-strong">
            {items.map((item) => (
              <div
                key={item.id}
                className="term-card border border-border-weak"
                data-testid="admin-training-data-card"
              >
                <div className="term-card-head">
                  <div className="term-card-name">{item.folder}</div>
                </div>
                <div className="term-card-body relative md:pr-52">
                  <div className="term-card-row">
                    <div className="term-card-label">{t('LEARNING_DATA.DISPLAY_NAME')}</div>
                    <div className="term-card-text">{item.server}</div>
                  </div>
                  <div className="term-card-row">
                    <div className="term-card-label">{t('LEARNING_DATA.DESCRIPTION')}</div>
                    <div className="term-card-text">{item.desc}</div>
                  </div>
                  <div className="term-card-actions">
                    <Button
                      variant="outline"
                      size="lg"
                      iconPosition="left"
                      icon={<SvgIcon name="edit" className="icon-20 leading-none" />}
                      dataTestid="admin-training-data-view-edit-button"
                      onClick={() => navigate(ROUTES.APP.ADMIN_TRAINING_DATA_DETAIL(item.id))}
                    >
                      <span>{t('LEARNING_DATA.VIEW_EDIT')}</span>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-8 md:mt-0">
            <Pagination
              totalPages={totalPages}
              maxVisiblePages={3}
              useQueryParams={false}
              showPageSize={false}
              showFirstLast={false}
              currentPageOverride={filter.pageIndex}
              onPageChange={store.updatePageIndex}
            />
          </div>
        </main>

        <div
          className="fixed md:hidden bottom-0 right-0 w-full flex justify-center p-4 bg-white border-t border-text-lighter/90"
          style={{ zIndex: 100 }}
        >
          <Button
            variant="solid"
            size="lg"
            iconPosition="left"
            fullWidth
            className="flex items-center justify-center w-full"
            icon={<SvgIcon name="addCircle" />}
            dataTestid="admin-training-data-create-button-sp"
            onClick={() => setIsCreateOpen(true)}
          >
            <span>{t('LEARNING_DATA.CREATE_NEW_FOLDER')}</span>
          </Button>
        </div>
      </div>

      {isCreateOpen && (
        <TrainingFolderAddDialog filter={filter} onClose={() => setIsCreateOpen(false)} />
      )}
    </div>
  );
}
