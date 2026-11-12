import { expect, test } from '@playwright/test';
import {
  applyOverrides,
  assertSafeTarget,
  ConfigError,
  expandShards,
  loadConfig,
  selectShards,
  tenantIdFor,
  type ExplorerConfig,
} from '../src/config.ts';

/** 設定・担当範囲・安全策の単体テスト。 */

test('expands groups and roles into shards', () => {
  /** 既定の設定から、画面のまとまり × 権限の担当範囲が重ならない ID で作られること */
  const shards = expandShards(loadConfig());
  expect(shards.map((s) => s.id)).toEqual([
    'auth-anonymous',
    'dashboard-admin',
    'dashboard-user',
    'account-admin',
    'account-user',
  ]);
  expect(shards.find((s) => s.id === 'auth-anonymous')?.tenantId).toBeUndefined();
  expect(shards.find((s) => s.id === 'dashboard-admin')?.tenantId).toBe('e2e-dashboard-admin');
  expect(new Set(shards.map((s) => s.tenantId).filter(Boolean)).size).toBe(4);
});

test('selects shards by id and rejects unknown ids', () => {
  /** --shard で指定した担当範囲だけが設定の順で選ばれ、未定義の ID はエラーになること */
  const shards = expandShards(loadConfig());
  expect(selectShards(shards, ['account-user', 'dashboard-admin']).map((s) => s.id)).toEqual([
    'dashboard-admin',
    'account-user',
  ]);
  expect(selectShards(shards, []).length).toBe(shards.length);
  expect(() => selectShards(shards, ['users-admin'])).toThrow(ConfigError);
});

test('rejects non-local targets unless explicitly allowed', () => {
  /** 対象がローカル以外なら、明示の引数がない限りエラーになること */
  const config = loadConfig();
  expect(() => assertSafeTarget(config, false)).not.toThrow();
  const remote: ExplorerConfig = structuredClone(config);
  remote.target.baseUrl = 'https://dev.example.com';
  expect(() => assertSafeTarget(remote, false)).toThrow(/ローカルではありません/);
  expect(() => assertSafeTarget(remote, true)).not.toThrow();
});

test('keeps tenant ids within 32 characters', () => {
  /** 担当範囲の ID が長くても、テナント ID は 32 文字以内で、別の ID とぶつからないこと */
  expect(tenantIdFor('dashboard-admin', 'e2e-')).toBe('e2e-dashboard-admin');
  const long1 = tenantIdFor('very-long-group-name-for-admin-screens-admin', 'e2e-');
  const long2 = tenantIdFor('very-long-group-name-for-admin-screens-user', 'e2e-');
  expect(long1.length).toBeLessThanOrEqual(32);
  expect(long2.length).toBeLessThanOrEqual(32);
  expect(long1).not.toBe(long2);
});

test('applies cli overrides and validates them', () => {
  /** 引数の上書きが反映され、不正な値はエラーになること */
  const config = loadConfig();
  const next = applyOverrides(config, { workers: 2, seed: 9, maxDepth: 1, maxActions: 3, maxMinutes: 1 });
  expect([next.workers, next.seed, next.limits.maxDepth, next.limits.maxActions, next.limits.maxMinutes]).toEqual([2, 9, 1, 3, 1]);
  expect(() => applyOverrides(config, { workers: 0 })).toThrow(ConfigError);
  const broken: ExplorerConfig = structuredClone(config);
  broken.groups[0].roles = ['nobody'];
  expect(() => applyOverrides(broken, {})).toThrow(/未定義の権限/);
});
