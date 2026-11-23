import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircularLoading } from '@/components/shared/circular-loading';
import { ContextMenu } from '@/components/shared/context-menu';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { Select } from '@/components/shared/select';
import { SelectWithSearch } from '@/components/shared/select-with-search';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { SelectOption } from '@/components/shared/types';
import {
  useAddAdditionalLearning,
  useFeedbackAssistants,
  useFeedbackMessages,
  useLearningFolders,
} from '@/hooks/use-feedback';
import type { FeedbackItem } from '@/types/admin/feedback.types';
import { buildAccuracyAdditionalLearningContent } from './additional-learning-content';
import {
  buildPageRange,
  FEEDBACK_PAGE_SIZE,
  FILTER_ALL,
  formatUpdatedAt,
  resolveAssistantName,
  toFilterParam,
  toPlainTableCellText,
} from './feedback-format';
import { FolderModal } from './folder-modal';

const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'FEEDBACK.SORT_BY_UPDATED' },
  { value: 'name', label: 'FEEDBACK.SORT_BY_ASSISTANT' },
  { value: 'accuracy', label: 'FEEDBACK.SORT_BY_ACCURACY' },
  { value: 'add', label: 'FEEDBACK.SORT_BY_ADD_LEARNING' },
  { value: 'folder', label: 'FEEDBACK.SORT_BY_FOLDER' },
];

const SORT_ORDER_OPTIONS: SortOption[] = [
  { value: 'asc', label: 'FEEDBACK.SORT_ASC' },
  { value: 'desc', label: 'FEEDBACK.SORT_DESC' },
];

/** 画面の精度の選択値から API の `rating` にする */
function toRating(accuracy: string | null): string | undefined {
  if (accuracy === 'accurate') return 'GOOD';
  if (accuracy === 'inaccurate') return 'BAD';
  return undefined;
}

/** 移植元 `AccuracyTabComponent`。回答精度の評価一覧と、追加学習先フォルダの指定 */
export function AccuracyTab() {
  const { t } = useTranslation();
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);
  const [selectedAccuracy, setSelectedAccuracy] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>('updatedAt');
  const [sortOrder, setSortOrder] = useState<string | null>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [learningItem, setLearningItem] = useState<FeedbackItem | null>(null);

  const assistantsQuery = useFeedbackAssistants();
  const foldersQuery = useLearningFolders();
  const addMutation = useAddAdditionalLearning();

  const accuracyQuery = useFeedbackMessages({
    assistantId: toFilterParam(selectedAssistant),
    rating: toRating(selectedAccuracy),
    folderId: toFilterParam(selectedFolder),
    // API は 0 始まり
    page: currentPage - 1,
    size: FEEDBACK_PAGE_SIZE,
    sortField: sortField ?? undefined,
    sortOrder: sortOrder ?? undefined,
  });

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);

  const items = useMemo<FeedbackItem[]>(() => {
    const data = accuracyQuery.data;
    if (!data) return [];
    const unknownAssistantLabel = t('CHAT.MESSAGE.UNKNOWN_ASSISTANT');
    return data.feedbacks.content.map((fb) => ({
      id: fb.id,
      accuracy: fb.rating === 'GOOD' ? 'accurate' : 'inaccurate',
      assistantName: resolveAssistantName(fb.message?.assistantName, unknownAssistantLabel),
      indexId: fb.indexId,
      learningFolder: folders.find((folder) => folder.id === fb.indexId)?.name ?? '-',
      questionSummary: toPlainTableCellText(fb.message?.content?.question ?? ''),
      answerSummary: toPlainTableCellText(fb.message?.content?.answer ?? ''),
      updatedAt: fb.updatedAt,
    }));
  }, [accuracyQuery.data, folders, t]);

  const assistantOptions = useMemo<SelectOption[]>(
    () => [
      { value: FILTER_ALL, label: t('FEEDBACK.ALL_ASSISTANTS') },
      ...(assistantsQuery.data ?? []).map((assistant) => ({
        value: assistant.id,
        label: assistant.name,
      })),
    ],
    [assistantsQuery.data, t],
  );

  const accuracyOptions = useMemo<SelectOption[]>(
    () => [
      { value: FILTER_ALL, label: t('FEEDBACK.ALL_ACCURACY') },
      { value: 'inaccurate', label: t('FEEDBACK.INACCURATE') },
      { value: 'accurate', label: t('FEEDBACK.ACCURATE') },
    ],
    [t],
  );

  const folderOptions = useMemo<SelectOption[]>(
    () => [
      { value: FILTER_ALL, label: t('FEEDBACK.ALL_FOLDERS') },
      ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
    ],
    [folders, t],
  );

  const feedbacks = accuracyQuery.data?.feedbacks;
  const totalPages = feedbacks?.totalPages ?? 1;
  const range = buildPageRange(feedbacks, FEEDBACK_PAGE_SIZE);
  const countDisplay = range.total === 0 ? '' : t('FEEDBACK.PAGE_COUNT', range);

  // フィルター・並べ替えを変えたら 1 ページ目へ戻す
  const changeFilter = (apply: () => void) => {
    apply();
    setCurrentPage(1);
  };

  const submitLearning = async (folderId: string) => {
    if (!learningItem) return;
    try {
      await addMutation.mutateAsync({
        indexId: folderId,
        target: { feedbackId: learningItem.id },
        content: buildAccuracyAdditionalLearningContent(learningItem),
      });
      setLearningItem(null);
    } catch {
      // 失敗の通知は api-client の共通エラートーストが出す。ダイアログは開いたままにする（移植元と同じ）
    }
  };

  return (
    <>
      <div>
        <p className="text-body">{t('FEEDBACK.ACCURACY_DESCRIPTION')}</p>
      </div>

      <div className="library-filters">
        <div className="flex flex-col gap-1 items-start w-full md:w-auto">
          <span className="library-filter-label">{t('FEEDBACK.FILTER')}</span>
          <div className="flex flex-col md:flex-row gap-2 w-full">
            <SelectWithSearch
              className="md:w-40 w-full"
              size="small"
              options={assistantOptions}
              testidPrefix="feedback-assistant"
              value={selectedAssistant}
              placeholder={t('FEEDBACK.ALL_ASSISTANTS')}
              supportText={t('FEEDBACK.FILTER_ASSISTANT_SUPPORT')}
              onValueChange={(value) => changeFilter(() => setSelectedAssistant(value))}
            />
            <Select
              className="md:w-40 w-full"
              size="small"
              options={accuracyOptions}
              value={selectedAccuracy}
              placeholder={t('FEEDBACK.ALL_ACCURACY')}
              onValueChange={(value) => changeFilter(() => setSelectedAccuracy(value))}
            />
            <SelectWithSearch
              className="md:w-40 w-full"
              size="small"
              options={folderOptions}
              value={selectedFolder}
              placeholder={t('FEEDBACK.ALL_FOLDERS')}
              supportText={t('FEEDBACK.FILTER_FOLDER_SUPPORT')}
              onValueChange={(value) => changeFilter(() => setSelectedFolder(value))}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 items-start w-full md:w-auto">
          <span className="library-filter-label">{t('FEEDBACK.SORT_ORDER')}</span>
          <FormSortInput
            className="w-full md:w-40"
            testidPrefix="feedback-sort"
            size="sm"
            fields={SORT_FIELD_OPTIONS}
            orders={SORT_ORDER_OPTIONS}
            selectedField={sortField}
            selectedOrder={sortOrder}
            onFieldChange={(value) => changeFilter(() => setSortField(value))}
            onOrderChange={(value) => changeFilter(() => setSortOrder(value))}
          />
        </div>

        <div className="flex items-center gap-3 w-full md:ml-auto md:w-auto justify-center md:justify-end">
          <Pagination
            totalPages={totalPages}
            useQueryParams={false}
            showPageSize={false}
            showPageNumbers={false}
            currentPageOverride={currentPage}
            countDisplay={countDisplay}
            onPageChange={setCurrentPage}
          />
        </div>
      </div>

      <TableList>
        <TableListItem
          isHeader
          className="hidden md:flex"
          actions={<span className="hidden md:inline-block w-9 h-9 invisible" />}
        >
          <span className="table-list-col-content table-list-label">
            {t('FEEDBACK.ASSISTANT_DISPLAY_NAME')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-16">
            {t('FEEDBACK.ACCURACY')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-87">
            {t('FEEDBACK.QUESTION_AND_ANSWER')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-30">
            {t('FEEDBACK.UPDATED_AT')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-16">
            {t('FEEDBACK.ADD_LEARNING')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-40">
            {t('FEEDBACK.LEARNING_FOLDER')}
          </span>
        </TableListItem>

        {items.map((item) => (
          <TableListItem
            key={item.id}
            actions={
              <ContextMenu
                triggerTestid={`feedback-menu-${item.id}`}
                panelClass="dropdown-menu dropdown-menu--bordered w-[280px]"
                menu={({ close }) => (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      className="flex items-center h-9 gap-2 p-2 rounded-lg hover:bg-bg-brand-weak transition-colors text-left"
                      onClick={() => {
                        setLearningItem(item);
                        close();
                      }}
                    >
                      {/* 移植元の `school` は svg-icon に登録がなく、空の枠が出る。同じ幅を空けて揃える */}
                      <span
                        aria-hidden="true"
                        className="flex items-center justify-center w-5 h-5 text-text-strong shrink-0"
                      />
                      <span className="text-label text-text-strong truncate">
                        {t('FEEDBACK.SPECIFY_FOLDER')}
                      </span>
                    </button>
                  </div>
                )}
              />
            }
          >
            <div className="table-list-col-content table-list-start-label">
              <span className="table-list-title text-label-large md:text-label-x-large">
                {item.assistantName}
              </span>
            </div>
            <div className="table-list-row-date md:justify-start md:w-16">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.ACCURACY')}
              </span>
              <span className="table-list-date flex-1 w-20 md:w-auto table-list-date text-body-small md:text-body text-text-strong font-normal">
                {item.accuracy === 'accurate' ? t('FEEDBACK.ACCURATE') : t('FEEDBACK.INACCURATE')}
              </span>
            </div>
            <div className="table-list-row-date md:justify-start md:w-87">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.QUESTION_AND_ANSWER')}
              </span>
              <div className="table-list-col-content gap-0.5 w-30 md:w-full">
                <p className="table-list-date truncate">{item.questionSummary}</p>
                <p className="table-list-date truncate">{item.answerSummary}</p>
              </div>
            </div>
            <div className="table-list-row-date md:justify-start md:w-30">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.UPDATED_AT')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
                {formatUpdatedAt(item.updatedAt)}
              </span>
            </div>
            <div className="table-list-row-date md:justify-start md:w-16">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.ADD_LEARNING')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto">
                {item.indexId ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="table-list-row-date md:justify-start md:w-40">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.LEARNING_FOLDER')}
              </span>
              <span className="flex-1 w-20 md:w-auto table-list-date text-body-small md:text-body text-text-strong font-normal">
                {item.learningFolder}
              </span>
            </div>
          </TableListItem>
        ))}

        {accuracyQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <CircularLoading />
          </div>
        ) : (
          items.length === 0 && (
            <div className="px-4 py-8 text-center text-text-muted">{t('FEEDBACK.NO_DATA')}</div>
          )
        )}
      </TableList>

      {items.length > 0 && (
        <div className="flex justify-center">
          <Pagination
            totalPages={totalPages}
            useQueryParams={false}
            showPageSize={false}
            showFirstLast={false}
            currentPageOverride={currentPage}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {learningItem && (
        <FolderModal
          initialFolderId={learningItem.indexId ?? null}
          isAdding={addMutation.isPending}
          onConfirm={(folderId) => void submitLearning(folderId)}
          onClose={() => setLearningItem(null)}
        />
      )}
    </>
  );
}
