import type { ChatHistoryApiItem } from '@app-types/chat-history.types';

const NAMES = ['苗字 名前A', '苗字 名前B', '苗字 名前C', '田中 太郎', '山田 花子'];
const ROOM_NAMES = [
  '新規採用プロセス検討',
  '営業会議の議事録要約',
  'マーケティング企画ブレスト',
  '採用面接フィードバック整理',
  'プロダクト要件レビュー',
];
const DESCRIPTION =
  '説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト説明テキスト';

const pad = (n: number) => String(n).padStart(2, '0');

function buildDate(daysAgo: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 5, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export const MOCK_CHAT_HISTORY: ChatHistoryApiItem[] = Array.from({ length: 28 }, (_, i) => ({
  id: i === 0 ? 'room-001' : `room-${i + 1}`,
  name: ROOM_NAMES[i % ROOM_NAMES.length],
  userId: `user-${(i % NAMES.length) + 1}`,
  userName: NAMES[i % NAMES.length],
  description: DESCRIPTION,
  createdAt: buildDate(i, 20),
  updatedAt: buildDate(i, 20),
}));
