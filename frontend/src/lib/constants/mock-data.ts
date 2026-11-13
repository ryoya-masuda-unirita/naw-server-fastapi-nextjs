/**
 * 旧ユーザー管理画面（`/users`）が使うモックデータ（移植元 core/constants/mock-data.ts）。
 * 移植元でもこの画面は API につながらず、このデータをメモリ上で編集する。
 */

export type LegacyUserRole = 'admin' | 'manager' | 'user';
export type LegacyUserAccountType = 'google' | 'microsoft' | 'local' | null;

/** 移植元 `User`。認証の `User`（types/auth.ts）とは別物なので Legacy を付けている */
export interface LegacyUser {
  id: string;
  username: string;
  displayName: string;
  role: LegacyUserRole;
  /** ログインキー（表示用のモック文字列） */
  loginKey: string;
  accountType: LegacyUserAccountType;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export const MOCK_USERS: LegacyUser[] = [
  {
    id: '1',
    username: 'sogaku.admin',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: 'google',
    status: 'active',
    createdAt: new Date('2024-01-15'),
  },
  {
    id: '2',
    username: 'alex.nguyen',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: 'microsoft',
    status: 'active',
    createdAt: new Date('2024-01-20'),
  },
  {
    id: '3',
    username: 'minh.tran',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: 'google',
    status: 'active',
    createdAt: new Date('2024-02-01'),
  },
  {
    id: '4',
    username: 'linh.pham',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '',
    accountType: null,
    status: 'inactive',
    createdAt: new Date('2024-02-10'),
  },
  {
    id: '5',
    username: 'khoa.le',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: null,
    status: 'active',
    createdAt: new Date('2024-02-15'),
  },
  {
    id: '6',
    username: 'ops.huy',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: null,
    status: 'active',
    createdAt: new Date('2024-03-01'),
  },
  {
    id: '7',
    username: 'tuan.ngo',
    displayName: '曽学 名前',
    role: 'manager',
    loginKey: '1万',
    accountType: 'google',
    status: 'active',
    createdAt: new Date('2024-03-05'),
  },
];

export const USER_ROLES: readonly { value: LegacyUserRole; label: string }[] = [
  { value: 'admin', label: '管理者' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'user', label: 'ユーザー' },
];
