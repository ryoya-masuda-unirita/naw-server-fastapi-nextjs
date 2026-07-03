import { describe, expect, it } from 'vitest';
import { buildUserDisplayNameMap, userDisplayName } from './user-display-name.util';

describe('user-display-name.util', () => {
  it('prefers displayName then name then email', () => {
    expect(
      userDisplayName({
        id: '1',
        userId: 'u1',
        displayName: '',
        name: '山田 太郎',
        role: 'user',
        usedTokens: null,
        loginKey: '',
        accountType: 'none',
        email: 'a@b.com',
        updatedAt: new Date(),
      }),
    ).toBe('山田 太郎');
  });

  it('buildUserDisplayNameMap keys by id and userId', () => {
    const map = buildUserDisplayNameMap([
      {
        id: 'uuid-1',
        userId: 'legacy-1',
        displayName: '表示名',
        role: 'user',
        usedTokens: null,
        loginKey: '',
        accountType: 'none',
        email: '',
        updatedAt: new Date(),
      },
    ]);
    expect(map.get('uuid-1')).toBe('表示名');
    expect(map.get('legacy-1')).toBe('表示名');
  });
});
