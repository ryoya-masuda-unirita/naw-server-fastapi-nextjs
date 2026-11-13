import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import { toDateTimeRange } from '@/components/shared/period-filter-utils';
import type {
  ChatHistoryApiResponse,
  ChatHistoryFilter,
  ChatHistorySortField,
} from '@/types/chat-history.types';

// 移植元 ChatHistoryApiService（list・listUsers）

const CHAT_HISTORY_QUERY_KEY = 'admin-chat-history';

/** 移植元 `listUsers` が取る履歴の件数。ユーザー専用の API がないため、新しい順の 1 ページ分から推定する */
const USER_OPTIONS_SIZE = 20;

/** ユーザーの選択肢（移植元 `ChatHistoryUserOption`） */
export interface ChatHistoryUserOption {
  userId: string;
  userName: string;
}

function toOrderBy(sortField: ChatHistorySortField): string {
  return sortField === 'roomName' ? 'name' : sortField;
}

function toListParams(filter: ChatHistoryFilter) {
  const sortField = filter.sortField ?? 'updatedAt';
  const sortOrder = filter.sortOrder ?? 'desc';
  // backend は ISO 8601（オフセット付き）だけを受け付け、終了は「より前」で判定する（#257）
  const period = toDateTimeRange({ from: filter.periodFrom, to: filter.periodTo });
  return {
    page: Math.max(0, filter.pageIndex - 1),
    size: filter.pageSize,
    userId: filter.userId,
    createdAtFrom: period.from,
    createdAtTo: period.to,
    name: filter.query,
    orderBy: toOrderBy(sortField),
    reverse: sortOrder === 'desc',
  };
}

/** 移植元 `ChatHistoryStore.load`。失敗時の共通エラートーストは api-client が出す */
export function useChatHistoryList(filter: ChatHistoryFilter) {
  return useQuery({
    queryKey: [CHAT_HISTORY_QUERY_KEY, 'list', filter],
    // 移植元は画面を開いたときと操作したときだけ読み込む。フォーカスで再取得すると一覧がスピナーに替わってしまう
    refetchOnWindowFocus: false,
    queryFn: () =>
      apiClient.get<ChatHistoryApiResponse>(API_PATHS.ADMIN.HISTORIES.LIST, {
        params: toListParams(filter),
      }),
  });
}

/** 絞り込みに使うユーザーの選択肢（移植元 `listUsers`。履歴の一覧から推定する近似） */
export function useChatHistoryUserOptions() {
  return useQuery({
    queryKey: [CHAT_HISTORY_QUERY_KEY, 'users'],
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChatHistoryUserOption[]> => {
      const res = await apiClient.get<ChatHistoryApiResponse>(API_PATHS.ADMIN.HISTORIES.LIST, {
        params: { page: 0, size: USER_OPTIONS_SIZE, orderBy: 'updatedAt', reverse: true },
      });
      const users = new Map<string, ChatHistoryUserOption>();
      for (const item of res.content) {
        if (item.userId && item.userName) {
          users.set(item.userId, { userId: item.userId, userName: item.userName });
        }
      }
      return [...users.values()];
    },
  });
}
