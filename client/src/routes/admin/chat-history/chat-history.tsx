import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChatHistoryFilter,
  type ChatHistoryFilterChange,
} from '@/components/features/admin/chat-history/chat-history-filter';
import { ChatHistoryList } from '@/components/features/admin/chat-history/chat-history-list';
import { AdminPageShell } from '@/components/layouts/admin-page-shell';
import { CircularLoading } from '@/components/shared/circular-loading';
import { PageHeader } from '@/components/shared/page-header';
import { Pagination } from '@/components/shared/pagination';
import { resolvePeriodRange } from '@/components/shared/period-filter-utils';
import type { SelectOption } from '@/components/shared/types';
import { useChatHistoryList, useChatHistoryUserOptions } from '@/hooks/use-chat-history';
import { useChatHistoryStore } from '@/store/chat-history-store';
import type { ChatHistoryApiItem, ChatHistoryItem } from '@/types/chat-history.types';

const pad = (value: number) => String(value).padStart(2, '0');

/** 移植元 `formatDate`。`yyyy/MM/dd HH:mm`（ローカルタイムゾーン）。日付として読めない値はそのまま返す */
function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toViewModel(item: ChatHistoryApiItem): ChatHistoryItem {
  return {
    id: item.id,
    date: formatDate(item.updatedAt),
    userId: item.userId ?? '',
    userName: item.userName ?? '',
    // backend はチャット名が未設定（null）のことがある
    roomName: item.name ?? '',
    description: item.description ?? undefined,
  };
}

/** 移植元 `ChatHistoryPageComponent`（chat-history）。チャット履歴の一覧画面 */
export function ChatHistoryPage() {
  const { t } = useTranslation();
  const { filter, updateFilter, updatePageIndex, reset } = useChatHistoryStore();

  const listQuery = useChatHistoryList(filter);
  const usersQuery = useChatHistoryUserOptions();

  // 取得に失敗した一覧は空として扱う（共通のエラートーストは api-client が出す）
  const items = useMemo(() => (listQuery.data?.content ?? []).map(toViewModel), [listQuery.data]);
  const totalItems = listQuery.data?.totalElements ?? 0;
  const userOptions = useMemo<SelectOption[]>(
    () => (usersQuery.data ?? []).map((user) => ({ label: user.userName, value: user.userId })),
    [usersQuery.data],
  );

  const totalPages = Math.max(1, Math.ceil(totalItems / filter.pageSize));
  const from = (filter.pageIndex - 1) * filter.pageSize + 1;
  const to = Math.min(filter.pageIndex * filter.pageSize, totalItems);
  const countDisplay =
    totalItems === 0 ? '' : t('CHAT_HISTORY.PAGE_COUNT', { from, to, total: totalItems });

  // 画面を離れたら検索・ページを捨てる。残すと、空に戻った検索欄の裏で前回の条件が効き続ける
  useEffect(() => reset, [reset]);

  const handleFilterChange = (event: ChatHistoryFilterChange) => {
    const range = resolvePeriodRange(event.period, event.periodRange);
    updateFilter({
      query: event.query || undefined,
      userId: event.user && event.user !== 'all' ? event.user : undefined,
      period: event.period,
      periodFrom: range.from,
      periodTo: range.to,
      sortField: event.sortField ?? 'updatedAt',
      sortOrder: event.sortOrder ?? 'desc',
    });
  };

  return (
    <AdminPageShell
      header={
        <PageHeader
          title=""
          titleKey="CHAT_HISTORY.TITLE"
          showActions={false}
          showBackButton={false}
        />
      }
    >
      <ChatHistoryFilter
        pageIndex={filter.pageIndex}
        totalPages={totalPages}
        countDisplay={countDisplay}
        userOptions={userOptions}
        onPageIndexChange={updatePageIndex}
        onFilterChange={handleFilterChange}
      />

      {listQuery.isFetching ? (
        <div className="flex justify-center p-8">
          <CircularLoading />
        </div>
      ) : (
        <>
          <ChatHistoryList items={items} />

          {totalItems > 0 && (
            <div className="flex justify-center">
              <Pagination
                totalPages={totalPages}
                useQueryParams={false}
                showPageSize={false}
                showFirstLast={false}
                currentPageOverride={filter.pageIndex}
                onPageChange={updatePageIndex}
              />
            </div>
          )}
        </>
      )}
    </AdminPageShell>
  );
}
