import { readFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { rawFinding } from '../src/oracle.ts';
import { fingerprintOf, mergeReports, normalizeForFingerprint, writeMergedReport } from '../src/report.ts';
import type { Finding, ShardReport } from '../src/types.ts';

/** レポートのまとめと出力の単体テスト。 */

function finding(shardId: string, role: string, overrides: Partial<Finding> = {}): Finding {
  const raw = rawFinding('http-5xx', 'GET /api/users/00000000-0000-4000-8000-000000000001', 'HTTP 500 Internal Server Error');
  return {
    ...raw,
    fingerprint: fingerprintOf(raw),
    shardId,
    role,
    steps: [{ description: '未ログインのまま / を開く' }, { description: 'ボタン「<b>読み込む</b>」をクリック' }],
    pageUrl: 'http://localhost:55173/',
    ...overrides,
  };
}

function shardReport(shardId: string, role: string, findings: Finding[]): ShardReport {
  return {
    shardId,
    groupId: shardId.split('-')[0],
    role,
    seed: 1,
    startedAt: '2026-11-13T00:00:00.000Z',
    finishedAt: '2026-11-13T00:01:00.000Z',
    durationMs: 60_000,
    stats: {
      states: 3,
      actions: 10,
      replays: 13,
      skippedShared: 1,
      claimedShared: 2,
      replayFailures: 0,
      placeholderStates: 1,
      relogins: 0,
      stoppedBy: 'queue-empty',
    },
    actionLog: [],
    states: [],
    outOfScope: [{ fromPath: '/', toUrl: 'http://localhost:55173/auth/login', action: 'ログアウト' }],
    replayFailures: [],
    findings,
  };
}

test('merges findings with the same fingerprint across shards', async () => {
  /** 2 つの担当範囲で同じ指紋の疑いは 1 件にまとまり、回数・担当範囲・権限が併記されること */
  const other = rawFinding('console-error', '/dashboard', 'わざとのエラー');
  const merged = mergeReports(
    [
      shardReport('users-admin', 'admin', [finding('users-admin', 'admin'), finding('users-admin', 'admin')]),
      shardReport('users-user', 'user', [
        finding('users-user', 'user', { screenshot: 'shards/users-user/artifacts/screenshot-1.png' }),
        { ...finding('users-user', 'user'), ...other, fingerprint: fingerprintOf(other) },
      ]),
    ],
    1
  );
  expect(merged.totals.groups).toBe(2);
  expect(merged.totals.occurrences).toBe(4);
  const server = merged.groups[0];
  expect(server.kind).toBe('http-5xx');
  expect(server.occurrences).toBe(3);
  expect(server.shards).toEqual(['users-admin', 'users-user']);
  expect(server.roles).toEqual(['admin', 'user']);
  expect(server.example.screenshot).toBe('shards/users-user/artifacts/screenshot-1.png');
  expect(merged.totals.bySeverity).toEqual({ high: 1, medium: 1, low: 0 });
});

test('normalizes ids and numbers in fingerprints', () => {
  /** ID・数字・クエリが違うだけの疑いは同じ指紋になること */
  expect(normalizeForFingerprint('GET /api/users/00000000-0000-4000-8000-000000000001?page=2')).toBe('GET /api/users/:uuid');
  const a = fingerprintOf({ kind: 'http-5xx', location: 'GET /api/rooms/12', message: 'HTTP 500' });
  const b = fingerprintOf({ kind: 'http-5xx', location: 'GET /api/rooms/345', message: 'HTTP 500' });
  const c = fingerprintOf({ kind: 'http-4xx', location: 'GET /api/rooms/345', message: 'HTTP 500' });
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test('writes json, markdown and escaped html', async () => {
  /** JSON・Markdown・HTML が書き出され、HTML の文字はエスケープされること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-report-'));
  const merged = mergeReports([shardReport('users-admin', 'admin', [finding('users-admin', 'admin')])], 1);
  const files = await writeMergedReport(dir, merged);
  const json = JSON.parse(await readFile(files.json, 'utf-8')) as { totals: { groups: number } };
  expect(json.totals.groups).toBe(1);
  const markdown = await readFile(files.markdown, 'utf-8');
  expect(markdown).toContain('| 1 | 高 | API が 500 番台を返した |');
  expect(markdown).toContain('2. ボタン「<b>読み込む</b>」をクリック');
  expect(markdown).toContain('## 担当外への遷移（掘っていない）');
  const html = await readFile(files.html, 'utf-8');
  expect(html).toContain('ボタン「&lt;b&gt;読み込む&lt;/b&gt;」をクリック');
  expect(html).not.toContain('<b>読み込む</b>');
});

test('writes an empty report when nothing is found', async () => {
  /** 疑いが 0 件でもレポートが出ること */
  const dir = await mkdtemp(path.join(os.tmpdir(), 'e2e-report-'));
  const files = await writeMergedReport(dir, mergeReports([shardReport('auth-anonymous', 'anonymous', [])], 1));
  expect(await readFile(files.markdown, 'utf-8')).toContain('疑いは見つかりませんでした。');
});
