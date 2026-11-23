import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolvePeriodRange, toDateTimeRange } from './period-filter-utils';

const FIXTURE_NOW = new Date(2026, 9, 9, 10, 30); // 2026-10-09 10:30（ローカル時刻）

describe('resolvePeriodRange', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXTURE_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('未選択（空文字）は期間の制約なしになること', () => {
    expect(resolvePeriodRange('', null)).toEqual({ from: undefined, to: undefined });
  });

  test('今日は今日だけの期間になること', () => {
    expect(resolvePeriodRange('today', null)).toEqual({ from: '2026-10-09', to: '2026-10-09' });
  });

  test('過去7日間は今日を含む7日間になること', () => {
    expect(resolvePeriodRange('7days', null)).toEqual({ from: '2026-10-03', to: '2026-10-09' });
  });

  test('過去30日間は月をまたいで今日を含む30日間になること', () => {
    expect(resolvePeriodRange('30days', null)).toEqual({ from: '2026-09-10', to: '2026-10-09' });
  });

  test('期間指定は選んだ期間をそのまま返すこと', () => {
    expect(resolvePeriodRange('custom', { from: '2026/10/01', to: '2026/10/05' })).toEqual({
      from: '2026/10/01',
      to: '2026/10/05',
    });
  });

  test('期間指定で片方が空のときは undefined にすること', () => {
    expect(resolvePeriodRange('custom', { from: '2026/10/01', to: '' })).toEqual({
      from: '2026/10/01',
      to: undefined,
    });
    expect(resolvePeriodRange('custom', null)).toEqual({ from: undefined, to: undefined });
  });

  test('未知のキーは期間の制約なしになること', () => {
    expect(resolvePeriodRange('90days', null)).toEqual({ from: undefined, to: undefined });
  });
});

describe('toDateTimeRange', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('日本時間のブラウザ', () => {
    beforeEach(() => {
      vi.stubEnv('TZ', 'Asia/Tokyo');
    });

    test('選択肢の形式（YYYY-MM-DD）を、開始日の 0:00 と終了日の翌日 0:00 の UTC の日時にすること', () => {
      expect(toDateTimeRange({ from: '2026-10-09', to: '2026-10-09' })).toEqual({
        from: '2026-10-08T15:00:00.000Z',
        to: '2026-10-09T15:00:00.000Z',
      });
    });

    test('カレンダーの形式（YYYY/MM/DD）も同じ日時にすること', () => {
      expect(toDateTimeRange({ from: '2026/10/09', to: '2026/10/09' })).toEqual({
        from: '2026-10-08T15:00:00.000Z',
        to: '2026-10-09T15:00:00.000Z',
      });
    });

    test('月末を終了日にすると、翌月 1 日の 0:00 にすること', () => {
      expect(toDateTimeRange({ to: '2026-10-31' }).to).toBe('2026-10-31T15:00:00.000Z');
    });

    test('日付が無いときは undefined にすること', () => {
      expect(toDateTimeRange({})).toEqual({ from: undefined, to: undefined });
    });

    test('日付として読めない値は、API サーバーの 400 で気づけるようそのまま返すこと', () => {
      expect(toDateTimeRange({ from: 'abc' }).from).toBe('abc');
    });
  });

  test('サマータイムが始まる日を終了日にしても、翌日の 0:00 にすること', () => {
    vi.stubEnv('TZ', 'America/New_York');

    // 2026-03-08 は 2:00 に UTC-5 から UTC-4 に変わるため、この日は 23 時間しかない
    expect(toDateTimeRange({ from: '2026-03-08', to: '2026-03-08' })).toEqual({
      from: '2026-03-08T05:00:00.000Z',
      to: '2026-03-09T04:00:00.000Z',
    });
  });
});
