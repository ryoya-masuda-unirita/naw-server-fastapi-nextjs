import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
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
  await writeFile(path.join(lockDir, 'owner'), 'crashed-worker');
  const old = new Date(Date.now() - 60_000);
  await utimes(lockDir, old, old);
  expect(await new SharedRegistry(file).claim('k', 'w')).toBe(true);
  // 壊したロックの残骸や一時ディレクトリを残さない
  expect((await readdir(dir)).sort()).toEqual(['shared-explored.json']);
});

test('waits for a fresh lock instead of breaking it', async () => {
  /** 新しいロックは壊さず、持ち主が外すまで待つこと */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
  const file = path.join(dir, 'shared-explored.json');
  const lockDir = `${file}.lock`;
  await mkdir(lockDir);
  await writeFile(path.join(lockDir, 'owner'), 'busy-worker');
  const claiming = new SharedRegistry(file).claim('k', 'w');
  await new Promise((r) => setTimeout(r, 200));
  expect(await readFile(path.join(lockDir, 'owner'), 'utf-8')).toBe('busy-worker');
  await rm(lockDir, { recursive: true });
  expect(await claiming).toBe(true);
});

test('releases keys so that a rerun of the same shard explores them again', async () => {
  /** 自分が取ったキーを手放すと、同じ担当範囲を流し直したときに再び取れること。他の担当範囲のキーは残ること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-registry-'));
  const registry = new SharedRegistry(path.join(dir, 'shared-explored.json'));
  await registry.claim('a', 'dashboard-admin');
  await registry.claim('b', 'dashboard-admin');
  await registry.claim('c', 'dashboard-user');
  expect(await registry.releaseOwner('dashboard-admin')).toBe(2);
  expect(await registry.claim('a', 'dashboard-admin')).toBe(true);
  expect(await registry.claim('c', 'dashboard-admin')).toBe(false);
  await registry.release('a', 'dashboard-user');
  expect(await registry.claim('a', 'dashboard-user')).toBe(false);
  await registry.release('a', 'dashboard-admin');
  expect(await registry.claim('a', 'dashboard-user')).toBe(true);
});
