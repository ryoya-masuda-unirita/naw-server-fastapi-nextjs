import { create } from 'zustand';
import { MOCK_USERS, type LegacyUser } from '@/lib/constants/mock-data';

/** 新規ユーザーの id に使う乱数の基数と、切り出す桁数（移植元 generateId と同じ形式） */
const ID_RANDOM_RADIX = 36;
const ID_RANDOM_START = 2;
const ID_RANDOM_END = 11;

interface LegacyUserStore {
  users: LegacyUser[];
  createUser: (userData: Omit<LegacyUser, 'id' | 'createdAt'>) => void;
  updateUser: (id: string, userData: Partial<LegacyUser>) => void;
  deleteUser: (id: string) => void;
}

function generateId(): string {
  const random = Math.random().toString(ID_RANDOM_RADIX).slice(ID_RANDOM_START, ID_RANDOM_END);
  return `user_${Date.now()}_${random}`;
}

/**
 * 旧ユーザー管理画面のユーザー一覧（移植元 core/services/user.service.ts のモック部分）。
 * 移植元は root の service がメモリに持つので、画面を離れても変更が残る。リロードで初期値に戻る点も同じ
 */
export const useLegacyUserStore = create<LegacyUserStore>((set) => ({
  users: [...MOCK_USERS],
  createUser: (userData) =>
    set((state) => ({
      users: [...state.users, { ...userData, id: generateId(), createdAt: new Date() }],
    })),
  updateUser: (id, userData) =>
    set((state) => ({
      users: state.users.map((user) => (user.id === id ? { ...user, ...userData } : user)),
    })),
  deleteUser: (id) => set((state) => ({ users: state.users.filter((user) => user.id !== id) })),
}));
