/**
 * Mock Data Constants
 *
 * Mock data for development and testing
 */

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'manager' | 'user';
  loginKey: string; // Login token
  accountType: 'google' | 'microsoft' | 'local' | null;
  status: 'active' | 'inactive';
  createdAt: Date;
}

export const MOCK_USERS: User[] = [
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

export const USER_ROLES = [
  { value: 'admin', label: '管理者' },
  { value: 'manager', label: 'マネージャー' },
  { value: 'user', label: 'ユーザー' },
] as const;
