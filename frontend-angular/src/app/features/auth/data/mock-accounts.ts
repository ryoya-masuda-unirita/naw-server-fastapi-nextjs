import { MockAccount } from '../types';

/**
 * Mock user accounts for testing
 * TODO: Remove this file when integrating with real API
 */
export const MOCK_ACCOUNTS: MockAccount[] = [
  {
    username: 'admin@admin.com',
    password: 'secret123!@#',
    id: '1',
    name: 'Admin User',
    role: 'ADMIN',
  },
  {
    username: 'user@user.com',
    password: 'secret123!@#',
    id: '2',
    name: 'User',
    role: 'USER',
  },
  {
    username: 'reset@user.com',
    password: 'secret123!@#',
    id: 'reset@user.com',
    name: 'Reset Required User',
    role: 'USER',
    requiresPasswordReset: true,
    passwordResetReason: 'INITIAL',
  },
  {
    username: 'expired@user.com',
    password: 'secret123!@#',
    id: 'expired@user.com',
    name: 'Expired Password User',
    role: 'USER',
    requiresPasswordReset: true,
    passwordResetReason: 'EXPIRED',
  },
];
