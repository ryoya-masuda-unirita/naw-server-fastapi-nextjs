import { describe, expect, test } from 'vitest';
import { matchesCurrentUser } from './auth-helpers';

const FIXTURE_CURRENT_USER = { id: 'u1', name: 'yamada' };

describe('matchesCurrentUser', () => {
  test('ID が一致すれば自分とみなすこと', () => {
    expect(matchesCurrentUser({ id: 'u1' }, FIXTURE_CURRENT_USER)).toBe(true);
  });

  test('名前がログイン名と一致すれば自分とみなすこと', () => {
    expect(matchesCurrentUser({ id: 'x', name: 'yamada' }, FIXTURE_CURRENT_USER)).toBe(true);
  });

  test('どの項目も一致しなければ自分ではないこと', () => {
    expect(matchesCurrentUser({ id: 'x', name: 'suzuki' }, FIXTURE_CURRENT_USER)).toBe(false);
  });

  test('空白だけの値同士は一致とみなさないこと', () => {
    expect(matchesCurrentUser({ id: ' ' }, { id: ' ', name: '' })).toBe(false);
  });

  test('未ログインなら自分ではないこと', () => {
    expect(matchesCurrentUser({ id: 'u1' }, null)).toBe(false);
  });
});
