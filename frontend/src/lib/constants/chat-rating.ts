import type { RoomFeedbackRating } from '@/types/chat/chat-room.type';

// 移植元 features/chat/constants/index.ts。評価ダイアログの星の数 <-> API の評価

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
