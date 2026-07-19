import { API_PATHS } from '../../constants/api-paths.config';
import {
  buildFeedbackMessagesResponse,
  buildFeedbackRoomsResponse,
  MOCK_FEEDBACK_MESSAGES,
  MOCK_FEEDBACK_ROOMS,
  MOCK_LEARNING_FOLDERS,
  type AdditionalLearningRequest,
} from '../../constants/mock-data/feedback.mock';
import { MOCK_COUNT_STATS, MOCK_ADMIN_USERS, MOCK_SATISFACTION_FEEDBACK } from '../admin-mock-data';
import { MockRoute } from '../api-mock';

function parseBody(body: unknown): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    body.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  return body as Record<string, unknown>;
}

function getPathOnly(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

function updateFeedbackIndexId(feedbackIds: string[], folderId: string): number {
  let updatedCount = 0;
  MOCK_FEEDBACK_MESSAGES.forEach((feedback, index) => {
    if (!feedbackIds.includes(feedback.id)) return;
    MOCK_FEEDBACK_MESSAGES[index] = {
      ...feedback,
      indexId: folderId,
      updatedAt: new Date().toISOString(),
    };
    updatedCount += 1;
  });
  return updatedCount;
}

function updateRoomFeedbackIndexId(feedbackIds: string[], folderId: string): number {
  let updatedCount = 0;
  MOCK_FEEDBACK_ROOMS.forEach((feedback, index) => {
    if (!feedbackIds.includes(feedback.roomId ?? '')) return;
    MOCK_FEEDBACK_ROOMS[index] = {
      ...feedback,
      indexId: folderId,
      updatedAt: new Date().toISOString(),
    };
    updatedCount += 1;
  });
  return updatedCount;
}

function getFeedbackRoomCountBySatisfaction(
  item: {
    feedbackRoomCount: {
      excellent: number;
      veryGood: number;
      good: number;
      average: number;
      poor: number;
    };
  },
  satisfaction: string,
): number {
  const map: Record<string, number> = {
    star1: item.feedbackRoomCount.poor,
    star2: item.feedbackRoomCount.average,
    star3: item.feedbackRoomCount.good,
    star4: item.feedbackRoomCount.veryGood,
    star5: item.feedbackRoomCount.excellent,
  };
  return map[satisfaction] ?? 0;
}

function getLatestFeedbackUpdatedAt(userId: string, fallback: string): string {
  const messageDates = MOCK_FEEDBACK_MESSAGES.filter((feedback) => feedback.userId === userId)
    .map((feedback) => feedback.updatedAt)
    .filter(Boolean);
  const roomDates = MOCK_FEEDBACK_ROOMS.filter((feedback) => feedback.userId === userId)
    .map((feedback) => feedback.updatedAt)
    .filter(Boolean);
  return [...messageDates, ...roomDates].sort().at(-1) ?? fallback;
}

export const adminFeedbackMockRoutes: MockRoute[] = [
  {
    method: 'GET',
    match: API_PATHS.ADMIN.FEEDBACK_USERS.LIST,
    handler: (_url, _body, params) => {
      const page = params['page'] ? parseInt(params['page'], 10) : 0;
      const size = params['size'] ? parseInt(params['size'], 10) : 25;
      const responseStatus = params['responseStatus'];
      const satisfaction = params['satisfaction'];
      const sortField = params['sortField'];
      const sortOrder = params['sortOrder'];
      let data = MOCK_ADMIN_USERS.map((user, index) => {
        const hasResponse = index % 3 !== 0;
        const userMessageFeedbacks = hasResponse
          ? MOCK_FEEDBACK_MESSAGES.filter(
              (feedback, feedbackIndex) =>
                feedback.userId === user.userId || feedbackIndex % 5 === index % 5,
            )
          : [];
        const userRoomFeedbacks = MOCK_FEEDBACK_ROOMS.filter(
          (feedback, feedbackIndex) =>
            feedback.userId === user.userId || feedbackIndex % 5 === index % 5,
        );

        return {
          user,
          isResponded: hasResponse && userMessageFeedbacks.length > 0,
          feedbackMessageCount: userMessageFeedbacks.length,
          updatedAt: getLatestFeedbackUpdatedAt(
            user.userId,
            user.updatedAt instanceof Date ? user.updatedAt.toISOString() : String(user.updatedAt),
          ),
          feedbackRoomCount: {
            excellent: userRoomFeedbacks.filter((feedback) => feedback.rating === 'EXCELLENT')
              .length,
            veryGood: userRoomFeedbacks.filter((feedback) => feedback.rating === 'VERY_GOOD')
              .length,
            good: userRoomFeedbacks.filter((feedback) => feedback.rating === 'GOOD').length,
            average: userRoomFeedbacks.filter((feedback) => feedback.rating === 'AVERAGE').length,
            poor: userRoomFeedbacks.filter((feedback) => feedback.rating === 'POOR').length,
          },
        };
      });

      if (responseStatus === 'has_response') {
        data = data.filter((item) => item.isResponded);
      } else if (responseStatus === 'no_response') {
        data = data.filter((item) => !item.isResponded);
      }

      if (satisfaction) {
        data = data.filter((item) => getFeedbackRoomCountBySatisfaction(item, satisfaction) > 0);
      }

      if (sortField) {
        const dir = sortOrder === 'asc' ? 1 : -1;
        data.sort((a, b) => {
          switch (sortField) {
            case 'updatedAt':
              return a.updatedAt.localeCompare(b.updatedAt) * dir;
            case 'name':
              return a.user.displayName.localeCompare(b.user.displayName) * dir;
            case 'count':
              return (a.feedbackMessageCount - b.feedbackMessageCount) * dir;
            case 'review1':
              return (a.feedbackRoomCount.poor - b.feedbackRoomCount.poor) * dir;
            case 'review2':
              return (a.feedbackRoomCount.average - b.feedbackRoomCount.average) * dir;
            case 'review3':
              return (a.feedbackRoomCount.good - b.feedbackRoomCount.good) * dir;
            case 'review4':
              return (a.feedbackRoomCount.veryGood - b.feedbackRoomCount.veryGood) * dir;
            case 'review5':
              return (a.feedbackRoomCount.excellent - b.feedbackRoomCount.excellent) * dir;
            default:
              return 0;
          }
        });
      }

      const totalElements = data.length;
      const totalPages = Math.max(1, Math.ceil(totalElements / size));
      const safePage = Math.max(0, Math.min(page, totalPages - 1));
      const content = data.slice(safePage * size, safePage * size + size);

      return [
        200,
        {
          feedbacks: {
            content,
            totalElements,
            totalPages,
            size,
            number: safePage,
            first: safePage === 0,
            last: safePage >= totalPages - 1,
            numberOfElements: content.length,
            empty: content.length === 0,
            sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
            pageable: {
              offset: safePage * size,
              paged: true,
              unpaged: false,
              pageNumber: safePage,
              pageSize: size,
              sort: { empty: !sortField, sorted: !!sortField, unsorted: !sortField },
            },
          },
        },
      ];
    },
  },
  {
    method: 'GET',
    match: API_PATHS.ADMIN.FEEDBACK_MESSAGES.LIST,
    handler: (_url, _body, params) => {
      const page = params['page'] ? parseInt(params['page'], 10) : 0;
      const size = params['size'] ? parseInt(params['size'], 10) : 25;
      return [
        200,
        buildFeedbackMessagesResponse(
          params['rating'],
          params['assistantId'],
          params['folderId'],
          page,
          size,
          params['sortField'],
          params['sortOrder'],
        ),
      ];
    },
  },
  {
    method: 'GET',
    match: API_PATHS.ADMIN.FEEDBACK_ROOMS.LIST,
    handler: (_url, _body, params) => {
      const page = params['page'] ? parseInt(params['page'], 10) : 0;
      const size = params['size'] ? parseInt(params['size'], 10) : 25;
      return [
        200,
        buildFeedbackRoomsResponse(
          params['rating'],
          params['assistantId'],
          params['folderId'],
          page,
          size,
          params['sortField'],
          params['sortOrder'],
        ),
      ];
    },
  },
  {
    method: 'GET',
    match: '/feedback/satisfaction',
    handler: () => [200, MOCK_SATISFACTION_FEEDBACK],
  },
  { method: 'GET', match: '/feedback/count', handler: () => [200, MOCK_COUNT_STATS] },
  {
    method: 'GET',
    match: API_PATHS.ADMIN.LEARNING_FOLDERS.LIST,
    handler: () => [200, { data: MOCK_LEARNING_FOLDERS }],
  },
  {
    method: 'POST',
    match: new RegExp(`^/admin/indexes/[^/]+/additionalLearning$`),
    handler: (url, body) => {
      const b = parseBody(body) as unknown as AdditionalLearningRequest;
      const pathParts = getPathOnly(url).split('/');
      const indexId = pathParts[pathParts.length - 2];
      const feedbackId = typeof b.feedbackId === 'string' ? b.feedbackId : undefined;
      const roomId = typeof b.roomId === 'string' ? b.roomId : undefined;
      const hasContent = b.content instanceof Blob;
      if ((!feedbackId && !roomId) || (feedbackId && roomId) || !hasContent) {
        return [400, { message: '追加学習のデータソースが正しく指定されていません。' }];
      }
      const updatedCount =
        (feedbackId ? updateFeedbackIndexId([feedbackId], indexId) : 0) +
        (roomId ? updateRoomFeedbackIndexId([roomId], indexId) : 0);
      if (updatedCount === 0) return [404, { message: 'Feedback not found' }];
      return [204, null];
    },
  },
];
