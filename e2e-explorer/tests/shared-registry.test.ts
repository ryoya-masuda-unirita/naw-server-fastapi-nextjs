import { mkdir, mkdtemp, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { SharedRegistry } from '../src/shared-registry.ts';

/** 調査済みの一覧（ファイルロック）の単体テスト。 */

test('grants a key to exactly one claimant under contention', async () => {
  /** 同じキーを同時に 20 回取り合っても、取れるのは 1 回だけであること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
  const file = path.join(dir, 'shared-explored.json');
  // 別々のプロセスを想定し、インスタンスも分ける
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, i) => new SharedRegistry(file).claim('aside|click|サイド', `worker-${i}`))
  );
  expect(results.filter(Boolean)).toHaveLength(1);
  const entries = await new SharedRegistry(file).entries();
  expect(Object.keys(entries)).toEqual(['aside|click|サイド']);
});

test('records different keys independently', async () => {
  /** 違うキーはそれぞれ取れること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
  const registry = new SharedRegistry(path.join(dir, 'shared-explored.json'));
  expect(await registry.claim('a', 'w1')).toBe(true);
  expect(await registry.claim('b', 'w2')).toBe(true);
  expect(await registry.claim('a', 'w2')).toBe(false);
});

test('removes a stale lock', async () => {
  /** 落ちたプロセスが残した古いロックは壊して先に進めること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
  const file = path.join(dir, 'shared-explored.json');
  const lockDir = `${file}.lock`;
  await mkdir(lockDir);
  const old = new Date(Date.now() - 60_000);
  await utimes(lockDir, old, old);
  expect(await new SharedRegistry(file).claim('k', 'w')).toBe(true);
});
