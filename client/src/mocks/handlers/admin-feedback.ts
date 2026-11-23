import { http, HttpResponse } from 'msw';
import { API_PATHS } from '@/lib/constants/api-paths';
import { mockPath } from '@/mocks/utils';

// 既定は空の一覧。テストごとの応答は server.use で上書きする。
// 形は backend の FeedbackMessageListResponse・FeedbackRoomListResponse・FeedbackUserListResponse に合わせる
// （`feedbacks` で包み、ページ情報は content・totalElements・number・size・totalPages・numberOfElements）。
const EMPTY_PAGE = {
  content: [],
  totalElements: 0,
  number: 0,
  size: 5,
  totalPages: 0,
  numberOfElements: 0,
};

export const adminFeedbackHandlers = [
  http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_MESSAGES.LIST), () =>
    HttpResponse.json({ feedbacks: EMPTY_PAGE, assistantIdToServerMap: {} }),
  ),
  http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_ROOMS.LIST), () =>
    HttpResponse.json({ feedbacks: EMPTY_PAGE }),
  ),
  http.get(mockPath(API_PATHS.ADMIN.FEEDBACK_USERS.LIST), () =>
    HttpResponse.json({ feedbacks: EMPTY_PAGE }),
  ),
];
