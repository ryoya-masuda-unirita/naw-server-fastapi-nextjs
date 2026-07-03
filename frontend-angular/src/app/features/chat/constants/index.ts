import { RoomFeedbackRating } from '@app-types/chat/chat-room.type';

export const RATING_MAP: Record<number, RoomFeedbackRating> = {
  5: 'EXCELLENT',
  4: 'VERY_GOOD',
  3: 'GOOD',
  2: 'AVERAGE',
  1: 'POOR',
};

export const REVERSE_RATING_MAP: Record<RoomFeedbackRating, number> = {
  EXCELLENT: 5,
  VERY_GOOD: 4,
  GOOD: 3,
  AVERAGE: 2,
  POOR: 1,
};
