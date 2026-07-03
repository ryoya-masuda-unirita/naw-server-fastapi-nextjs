import {
  ChatRoom,
  RoomsListResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  RoomFeedbackRequest,
  RoomFeedbackResponse,
} from '@app-types/chat/chat-room.type';

export type {
  RoomsListResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  RoomFeedbackRequest,
  RoomFeedbackResponse,
};

export interface MockShare {
  id: string;
  roomId: string;
  teamIds: string[];
}

export const MOCK_SHARES: MockShare[] = [
  { id: 'share-001', roomId: 'room-001', teamIds: ['1', '3'] },
  { id: 'share-002', roomId: 'room-005', teamIds: ['2', '4', '5'] },
];

export const MOCK_ROOMS: ChatRoom[] = [
  {
    id: 'room-001',
    name: '医療に関する質問 ',
    isPinned: true,
    lastMessage: '有給休暇の申請方法を教えてください。',
    lastMessageTime: new Date('2026-04-15T10:30:00'),
    category: 'chat',
    shareId: 'share-001',
    teamIds: ['1', '3'],
    rating: 'EXCELLENT',
  },
  {
    id: 'room-002',
    name: '在庫最適化シミュレーション ',
    isPinned: true,
    lastMessage: '先月の売上データを集計してください。',
    lastMessageTime: new Date('2026-04-14T15:45:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-003',
    name: 'プロジェクト進捗確認',
    isPinned: false,
    lastMessage: '現在のタスク状況を確認したい。',
    lastMessageTime: new Date('2026-04-13T09:00:00'),
    category: 'chat',
    rating: 'VERY_GOOD',
  },
  {
    id: 'room-004',
    name: '経費精算の手順',
    isPinned: false,
    lastMessage: '交通費の申請書類は何が必要ですか？',
    lastMessageTime: new Date('2026-04-12T14:20:00'),
    category: 'chat',
    rating: 'AVERAGE',
  },
  {
    id: 'room-005',
    name: 'マーケティング戦略',
    isPinned: false,
    lastMessage: '新製品のキャンペーン案を作成してほしい。',
    lastMessageTime: new Date('2026-04-11T11:00:00'),
    category: 'chat',
    shareId: 'share-002',
    teamIds: ['2', '4', '5'],
    rating: 'POOR',
  },
  {
    id: 'room-006',
    name: '顧客データ集計',
    isPinned: false,
    lastMessage: '先月の新規顧客数を教えてください。',
    lastMessageTime: new Date('2026-04-10T16:30:00'),
    category: 'chat',
    rating: 'EXCELLENT',
  },
  {
    id: 'room-007',
    name: 'セキュリティポリシー確認',
    isPinned: false,
    lastMessage: 'パスワードポリシーのルールを教えてください。',
    lastMessageTime: new Date('2026-04-09T08:45:00'),
    category: 'chat',
    rating: 'VERY_GOOD',
  },
  {
    id: 'room-008',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-009',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-010',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-011',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-012',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-013',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-014',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  {
    id: 'room-015',
    name: '採用面接質問リスト',
    isPinned: false,
    lastMessage: '技術面接で使える質問を提案してください。',
    lastMessageTime: new Date('2026-04-08T13:15:00'),
    category: 'chat',
    rating: 'GOOD',
  },
  ...Array.from({ length: 13 }, (_, index) => {
    const n = index + 16;
    return {
      id: `room-${String(n).padStart(3, '0')}`,
      name: `テストチャット ${n}`,
      isPinned: n === 16,
      lastMessage: `ページング確認用メッセージ ${n}`,
      lastMessageTime: new Date(`2026-04-${String(Math.min(n, 28)).padStart(2, '0')}T10:00:00`),
      category: 'chat' as const,
      rating: 'GOOD' as const,
    };
  }),
];

export const MOCK_ROOMS_LIST_RESPONSE: RoomsListResponse = {
  content: MOCK_ROOMS,
  total: MOCK_ROOMS.length,
  page: 1,
  pageSize: 20,
};

export const mockCreateRoom = (req: CreateRoomRequest): CreateRoomResponse => ({
  data: {
    id: `room-${Date.now()}`,
    name: req.name || '新しいチャット',
    isPinned: false,
    lastMessage: undefined,
    lastMessageTime: new Date(),
    category: 'chat',
  },
});
