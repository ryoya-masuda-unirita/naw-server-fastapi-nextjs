import { describe, expect, test } from 'vitest';
import type { TokenUsageListItem } from '@/types/token-usage.type';
import { usageUserLabel } from './usage-user-label';

const translate = (key: string) => `t:${key}`;

function item(overrides: Partial<TokenUsageListItem>): TokenUsageListItem {
  return {
    userId: 'u1',
    userName: '山田太郎',
    userType: 'ACTIVE',
    ...overrides,
  } as TokenUsageListItem;
}

describe('usageUserLabel', () => {
  test('shows the user name for an active user', () => {
    /** 通常のユーザーは、API が返す名前を出す */
    expect(usageUserLabel(item({}), translate)).toBe('山田太郎');
  });

  test('shows the SYSTEM label instead of the name for a SYSTEM user', () => {
    /** SYSTEM ユーザーは、名前が入っていても文言を出す */
    expect(usageUserLabel(item({ userType: 'SYSTEM', userName: 'system' }), translate)).toBe(
      't:TENANT.HISTORY_USER_SYSTEM',
    );
  });

  test('shows the deleted label for a deleted user', () => {
    /** 削除されたユーザーは、ID を出さず文言を出す */
    expect(usageUserLabel(item({ userType: 'DELETED', userName: null }), translate)).toBe(
      't:TENANT.HISTORY_USER_DELETED',
    );
  });

  test('shows the deleted label for a row without a user id', () => {
    /** 利用者の ID が無い行は、API が DELETED で返す。`-` ではなく文言を出す */
    expect(
      usageUserLabel(item({ userId: null, userType: 'DELETED', userName: null }), translate),
    ).toBe('t:TENANT.HISTORY_USER_DELETED');
  });
});
