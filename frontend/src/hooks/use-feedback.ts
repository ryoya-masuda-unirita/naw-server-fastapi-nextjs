import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { API_PATHS } from '@/lib/constants/api-paths';
import type { AssistantApiItem } from '@/types/admin/assistant.types';
import type {
  GetFeedbackUserViewModel,
  GetMessageFeedbackViewModel,
  GetRoomFeedbackViewModel,
} from '@/types/admin/feedback.types';
import type { PagedResponse } from '@/types/api-response.type';
import type { RoomFeedbackRating } from '@/types/chat/chat-room.type';

// 移植元 feedback-list の FeedbackMessageApiService・FeedbackRoomService・FeedbackUserApiService・
// FeedbackListOptionsService をまとめたもの。

/** 追加学習のあとに一覧を読み直すための key の先頭（移植元の `['feedback', 'accuracy' | 'satisfaction']`） */
const FEEDBACK_QUERY_KEY = 'feedback';

/** 移植元 app.config.ts の QueryClient の `staleTime`（5 分）。選択肢は頻繁に変わらないので揃える */
const OPTIONS_STALE_TIME_MS = 5 * 60 * 1000;

export interface FeedbackMessageQueryParams {
  assistantId?: string;
  rating?: string;
  folderId?: string;
  page?: number;
  size?: number;
  sortField?: string;
  sortOrder?: string;
}

export interface FeedbackRoomQueryParams {
  assistantId?: string;
  rating?: RoomFeedbackRating | 'UNRATED';
  folderId?: string;
  page?: number;
  size?: number;
  sortField?: string;
  sortOrder?: string;
}

export interface FeedbackUserQueryParams {
  page?: number;
  size?: number;
  responseStatus?: string;
  satisfaction?: string;
  sortField?: string;
  sortOrder?: string;
}

/** 追加学習先のフォルダ（移植元 `LearningFolderItem`） */
export interface LearningFolder {
  id: string;
  name: string;
  description: string;
  category: string;
}

/** 回答精度タブの一覧（移植元 `accuracyQuery`）。タブを開くたびに読み直す */
export function useFeedbackMessages(params: FeedbackMessageQueryParams) {
  return useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, 'accuracy', params],
    refetchOnMount: 'always',
    queryFn: () =>
      apiClient.get<GetMessageFeedbackViewModel>(API_PATHS.ADMIN.FEEDBACK_MESSAGES.LIST, {
        params: { ...params },
      }),
  });
}

/** チャット満足度タブの一覧（移植元 `createRoomFeedbackQuery`） */
export function useFeedbackRooms(params: FeedbackRoomQueryParams) {
  return useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, 'satisfaction', params],
    queryFn: () =>
      apiClient.get<GetRoomFeedbackViewModel>(API_PATHS.ADMIN.FEEDBACK_ROOMS.LIST, {
        params: { ...params },
      }),
  });
}

/** 回答数一覧タブの一覧（移植元 `injectFeedbackUsersQuery`） */
export function useFeedbackUsers(params: FeedbackUserQueryParams) {
  return useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, 'users', params],
    queryFn: () =>
      apiClient.get<GetFeedbackUserViewModel>(API_PATHS.ADMIN.FEEDBACK_USERS.LIST, {
        params: { ...params },
      }),
  });
}

/**
 * 絞り込みのアシスタント選択肢。ユーザー向け `/assistants` ではなく管理者向け一覧を使う（移植元 `adminAssistantsQuery`）。
 * 移植元はページ指定なしで取る（backend の既定件数）
 */
export function useFeedbackAssistants() {
  return useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, 'assistant-options'],
    staleTime: OPTIONS_STALE_TIME_MS,
    queryFn: async () => {
      const res = await apiClient.get<PagedResponse<AssistantApiItem>>(
        API_PATHS.ADMIN.ASSISTANTS.LIST,
      );
      return res.content;
    },
  });
}

/**
 * 追加学習先フォルダの一覧。`/admin/learning-folders` は backend にないため `/admin/indexes` を使う
 * （移植元 `learningFoldersQuery`。説明・カテゴリは持たないので空にする）
 */
export function useLearningFolders() {
  return useQuery({
    queryKey: [FEEDBACK_QUERY_KEY, 'learning-folders'],
    staleTime: OPTIONS_STALE_TIME_MS,
    queryFn: async (): Promise<LearningFolder[]> => {
      const res = await apiClient.get<
        { id: string; name: string }[] | { content: { id: string; name: string }[] }
      >(API_PATHS.INDEXES.LIST);
      const items = Array.isArray(res) ? res : (res?.content ?? []);
      return items.map((item) => ({
        id: item.id,
        name: item.name,
        description: '',
        category: '',
      }));
    },
  });
}

export interface AddAdditionalLearningVariables {
  indexId: string;
  /** 回答精度タブは `feedbackId`、満足度タブは `roomId` を送る（混ぜない） */
  target: { feedbackId: string } | { roomId: string };
  content: File;
}

/**
 * 追加学習の登録（移植元 `addAdditionalLearning`）。成功したら両タブの一覧を読み直す。
 * 失敗の通知は api-client の共通エラートーストが出す
 */
export function useAddAdditionalLearning() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ indexId, target, content }: AddAdditionalLearningVariables) => {
      const body = new FormData();
      if ('feedbackId' in target) body.append('feedbackId', target.feedbackId);
      else body.append('roomId', target.roomId);
      body.append('content', content);
      return apiClient.post<void>(API_PATHS.INDEXES.ADDITIONAL_LEARNING(indexId), body);
    },
    onSuccess: (_data, { target }) =>
      queryClient.invalidateQueries({
        queryKey: [FEEDBACK_QUERY_KEY, 'feedbackId' in target ? 'accuracy' : 'satisfaction'],
      }),
  });
}
