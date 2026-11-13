import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircularLoading } from '@/components/shared/circular-loading';
import { FormSortInput, type SortOption } from '@/components/shared/form-sort-input';
import { Pagination } from '@/components/shared/pagination';
import { Select } from '@/components/shared/select';
import { TableList, TableListItem } from '@/components/shared/table-list';
import type { SelectOption } from '@/components/shared/types';
import { useAdminUsers } from '@/hooks/use-admin-users';
import { useFeedbackUsers } from '@/hooks/use-feedback';
import type { CountStatItem, FeedbackUserItem } from '@/types/admin/feedback.types';
import {
  buildPageRange,
  buildSatisfactionOptions,
  FEEDBACK_PAGE_SIZE,
  FILTER_ALL,
  formatUpdatedAt,
  toFilterParam,
} from './feedback-format';

const SORT_FIELD_OPTIONS: SortOption[] = [
  { value: 'updatedAt', label: 'FEEDBACK.SORT_BY_UPDATED' },
  { value: 'name', label: 'FEEDBACK.SORT_BY_USER' },
  { value: 'count', label: 'FEEDBACK.SORT_BY_ACCURACY_COUNT' },
  { value: 'review1', label: 'FEEDBACK.SORT_BY_SAT1' },
  { value: 'review2', label: 'FEEDBACK.SORT_BY_SAT2' },
  { value: 'review3', label: 'FEEDBACK.SORT_BY_SAT3' },
  { value: 'review4', label: 'FEEDBACK.SORT_BY_SAT4' },
  { value: 'review5', label: 'FEEDBACK.SORT_BY_SAT5' },
];

const SORT_ORDER_OPTIONS: SortOption[] = [
  { value: 'asc', label: 'FEEDBACK.SORT_ASC' },
  { value: 'desc', label: 'FEEDBACK.SORT_DESC' },
];

/** 数値の列。モバイルの行ラベルとデスクトップの見出しで使うキーが違う（移植元どおり） */
const COUNT_COLUMNS: {
  field:
    | 'accuracyCount'
    | 'satisfaction1'
    | 'satisfaction2'
    | 'satisfaction3'
    | 'satisfaction4'
    | 'satisfaction5';
  headerKey: string;
  rowLabelKey: string;
}[] = [
  {
    field: 'accuracyCount',
    headerKey: 'FEEDBACK.ACCURACY_COUNT',
    rowLabelKey: 'FEEDBACK.ACCURACY_EVALUATION',
  },
  {
    field: 'satisfaction1',
    headerKey: 'FEEDBACK.SAT1_LABEL',
    rowLabelKey: 'FEEDBACK.SAT1_LABEL',
  },
  {
    field: 'satisfaction2',
    headerKey: 'FEEDBACK.SAT2_LABEL',
    rowLabelKey: 'FEEDBACK.SAT2_LABEL',
  },
  {
    field: 'satisfaction3',
    headerKey: 'FEEDBACK.SAT3_LABEL',
    rowLabelKey: 'FEEDBACK.SAT3_LABEL',
  },
  {
    field: 'satisfaction4',
    headerKey: 'FEEDBACK.SAT4_LABEL',
    rowLabelKey: 'FEEDBACK.SAT4_LABEL',
  },
  {
    field: 'satisfaction5',
    headerKey: 'FEEDBACK.SAT5_LABEL',
    rowLabelKey: 'FEEDBACK.SAT5_LABEL',
  },
];

function toCountStatItem(item: FeedbackUserItem, userNameMap: Map<string, string>): CountStatItem {
  return {
    id: item.user.id,
    userName:
      userNameMap.get(item.user.id) ?? userNameMap.get(item.user.userId) ?? item.user.displayName,
    isResponded: item.isResponded,
    updatedAt: item.updatedAt,
    accuracyCount: item.feedbackMessageCount,
    satisfaction1: item.feedbackRoomCount.poor,
    satisfaction2: item.feedbackRoomCount.average,
    satisfaction3: item.feedbackRoomCount.good,
    satisfaction4: item.feedbackRoomCount.veryGood,
    satisfaction5: item.feedbackRoomCount.excellent,
  };
}

/** 移植元 `CountTabComponent`。ユーザーごとの精度評価・満足度の回答数の一覧 */
export function CountTab() {
  const { t } = useTranslation();
  const [selectedResponseStatus, setSelectedResponseStatus] = useState<string | null>(null);
  const [selectedSatisfaction, setSelectedSatisfaction] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string | null>('updatedAt');
  const [sortOrder, setSortOrder] = useState<string | null>('desc');
  const [currentPage, setCurrentPage] = useState(1);

  const usersQuery = useFeedbackUsers({
    page: currentPage - 1,
    size: FEEDBACK_PAGE_SIZE,
    responseStatus: toFilterParam(selectedResponseStatus),
    satisfaction: toFilterParam(selectedSatisfaction),
    sortField: sortField ?? undefined,
    sortOrder: sortOrder ?? undefined,
  });

  // 移植元は表示名をユーザー管理 API の値で上書きする（条件は現在のページ番号・5 件・更新日時の降順）
  const adminUsersQuery = useAdminUsers({
    query: undefined,
    pageIndex: currentPage,
    pageSize: FEEDBACK_PAGE_SIZE,
    sortField: 'updatedAt',
    sortOrder: 'desc',
  });

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (adminUsersQuery.data?.data ?? []).forEach((user) => {
      map.set(user.id, user.displayName);
      map.set(user.userId, user.displayName);
    });
    return map;
  }, [adminUsersQuery.data]);

  const items = useMemo<CountStatItem[]>(
    () =>
      (usersQuery.data?.feedbacks.content ?? []).map((item) => toCountStatItem(item, userNameMap)),
    [usersQuery.data, userNameMap],
  );

  const isLoading = usersQuery.isFetching || adminUsersQuery.isFetching;

  const responseStatusOptions = useMemo<SelectOption[]>(
    () => [
      { value: FILTER_ALL, label: t('FEEDBACK.ALL_RESPONSES') },
      { value: 'has_response', label: t('FEEDBACK.RESPONDED') },
      { value: 'no_response', label: t('FEEDBACK.NO_RESPONSE') },
    ],
    [t],
  );

  const satisfactionOptions = useMemo(
    () => buildSatisfactionOptions(t('FEEDBACK.ALL_SATISFACTION')),
    [t],
  );

  const feedbacks = usersQuery.data?.feedbacks;
  const totalPages = feedbacks?.totalPages ?? 1;
  const range = buildPageRange(feedbacks, FEEDBACK_PAGE_SIZE);
  const countDisplay = range.total === 0 ? '' : t('FEEDBACK.PAGE_COUNT', range);

  const changeFilter = (apply: () => void) => {
    apply();
    setCurrentPage(1);
  };

  return (
    <>
      <p className="text-body">{t('FEEDBACK.COUNT_DESCRIPTION')}</p>

      <div className="library-filters">
        <div className="flex flex-col gap-1 items-start w-full md:w-auto">
          <span className="library-filter-label">{t('FEEDBACK.FILTER')}</span>
          <div className="flex flex-col md:flex-row gap-2 w-full">
            <Select
              className="md:w-40 w-full"
              size="small"
              options={responseStatusOptions}
              value={selectedResponseStatus}
              placeholder={t('FEEDBACK.ALL_RESPONSES')}
              onValueChange={(value) => changeFilter(() => setSelectedResponseStatus(value))}
            />
            <Select
              className="md:w-40 w-full"
              size="small"
              options={satisfactionOptions}
              value={selectedSatisfaction}
              placeholder={t('FEEDBACK.ALL_SATISFACTION')}
              onValueChange={(value) => changeFilter(() => setSelectedSatisfaction(value))}
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
            // 移植元は並べ替え順を空にしない（null は無視して 1 ページ目へ戻すだけ）
            onOrderChange={(value) =>
              changeFilter(() => {
                if (value) setSortOrder(value);
              })
            }
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
          hasActions={false}
          className="hidden table-list-row-content md:flex"
        >
          <span className="table-list-col-content table-list-label flex-1">
            {t('FEEDBACK.USER_DISPLAY_NAME')}
          </span>
          <span className="table-list-row-date md:justify-start table-list-label md:w-30">
            {t('FEEDBACK.UPDATED_AT')}
          </span>
          {COUNT_COLUMNS.map((column) => (
            <span
              key={column.field}
              className="table-list-row-date md:justify-start table-list-label md:w-30.75"
            >
              {t(column.headerKey)}
            </span>
          ))}
        </TableListItem>

        {items.map((item) => (
          <TableListItem key={item.id} hasActions={false}>
            <div className="table-list-col-content table-list-start-label">
              <span className="table-list-title text-label-large md:text-label-x-large">
                {item.userName}
              </span>
            </div>
            <div className="table-list-row-date md:justify-start md:w-30">
              <span className="table-list-label md:hidden w-30 md:w-auto">
                {t('FEEDBACK.UPDATED_AT')}
              </span>
              <span className="table-list-date flex-1 w-30 md:w-auto text-label text-text-medium font-medium">
                {formatUpdatedAt(item.updatedAt)}
              </span>
            </div>
            {COUNT_COLUMNS.map((column) => (
              <div key={column.field} className="table-list-row-date md:justify-start md:w-30.75">
                <span className="table-list-label md:hidden w-30 md:w-auto">
                  {t(column.rowLabelKey)}
                </span>
                <span className="table-list-date text-body-small md:text-body text-text-strong md:w-full font-normal flex-1 flex flex-col gap-1 w-30">
                  {item[column.field]}
                </span>
              </div>
            ))}
          </TableListItem>
        ))}

        {isLoading ? (
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
    </>
  );
}
