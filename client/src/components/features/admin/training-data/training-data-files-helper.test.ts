import { describe, expect, test } from 'vitest';
import type { TrainingDataFile, TrainingDataFileFilter } from '@/types/training-data.types';
import { fileRowToTrainingDataFile } from './training-data-api-normalize';
import { fromSplitLength, toSplitLength } from './training-data-chunk-size';
import {
  formatDateTimeMinutes,
  resolveFileUpdaters,
  toFileListApiParams,
} from './training-data-files-helper';

const FIXTURE_FILTER: TrainingDataFileFilter = {
  query: '',
  selectedPeriod: null,
  filterPeriodRange: null,
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

const FIXTURE_FILE: TrainingDataFile = {
  id: 'f1',
  displayName: '資料',
  updatedAt: '2026-11-01T09:00:00',
  updatedBy: '山田太郎',
  userId: 'u1',
  status: 'ENABLE',
};

describe('toSplitLength / fromSplitLength', () => {
  test('プリセットを文字数にできること', () => {
    expect(toSplitLength('small')).toBe('500');
    expect(toSplitLength('medium')).toBe('1000');
    expect(toSplitLength('large')).toBe('2000');
  });

  test('100 から 10000 の整数だけを数値として受け付けること', () => {
    expect(toSplitLength('100')).toBe('100');
    expect(toSplitLength('10000')).toBe('10000');
    expect(toSplitLength('99')).toBeUndefined();
    expect(toSplitLength('10001')).toBeUndefined();
    expect(toSplitLength('12.5')).toBeUndefined();
    expect(toSplitLength('abc')).toBeUndefined();
    expect(toSplitLength('')).toBeUndefined();
  });

  test('文字数をプリセットまたは数値の文字列に戻せること', () => {
    expect(fromSplitLength(1000)).toBe('medium');
    expect(fromSplitLength('750')).toBe('750');
    expect(fromSplitLength(undefined)).toBe('');
  });
});

describe('toFileListApiParams', () => {
  test('検索語が表示名とファイル名の両方の条件になること', () => {
    const params = toFileListApiParams({ ...FIXTURE_FILTER, query: ' 規程 ' });

    expect(params.displayName).toBe('規程');
    expect(params.fileName).toBe('規程');
  });

  test('does not send a user condition', () => {
    /** 更新者の絞り込みは画面から外した（NAW-1424）。API にも更新者の条件を送らない */
    expect(toFileListApiParams(FIXTURE_FILTER)).not.toHaveProperty('userId');
  });

  test('更新者名順は userId で並べ、方向が空なら降順になること', () => {
    const params = toFileListApiParams({
      ...FIXTURE_FILTER,
      sortField: 'updatedBy',
      sortOrder: '',
    });

    expect(params.sort).toBe('userId,desc');
  });

  test('ページは 0 始まりで送ること', () => {
    expect(toFileListApiParams({ ...FIXTURE_FILTER, pageIndex: 3 }).page).toBe(2);
  });
});

describe('formatDateTimeMinutes', () => {
  test('yyyy/MM/dd HH:mm の形にし、解釈できない値は空にすること', () => {
    expect(formatDateTimeMinutes('2026-11-01T09:05:30')).toBe('2026/11/01 09:05');
    expect(formatDateTimeMinutes('invalid')).toBe('');
  });
});

describe('fileRowToTrainingDataFile', () => {
  const ROW = {
    id: 'f1',
    fileName: 'manual.pdf',
    displayName: null,
    reference: null,
    status: 'ENABLE',
    userId: 'u1',
    updatedAt: '2026-11-01T09:00:00',
    updatedBy: null,
  };

  test('表示名が無いときはファイル名を表示名にすること', () => {
    expect(fileRowToTrainingDataFile(ROW).displayName).toBe('manual.pdf');
  });

  test('keeps the updater name empty when the api has none', () => {
    /** 名前が無いときにユーザーの ID を更新者名にしない（一覧は「削除されたユーザー」と出す） */
    expect(fileRowToTrainingDataFile(ROW).updatedBy).toBe('');
  });

  test('未知の状態は DISABLE として扱うこと', () => {
    expect(fileRowToTrainingDataFile({ ...ROW, status: 'UNKNOWN' }).status).toBe('DISABLE');
  });
});

describe('resolveFileUpdaters', () => {
  test('uses the updater name of the file', () => {
    /** 更新者の名前（クラウドは API が返す名前、ローカルは一覧を取るときに引いた名前）をそのまま出す */
    expect(resolveFileUpdaters([FIXTURE_FILE])[0].updater).toEqual({
      kind: 'USER',
      name: '山田太郎',
    });
  });

  test('shows a deleted user when the id is there but the name is not', () => {
    /** 更新者の ID はあるが名前が無い（削除されたユーザーなど）ときは、ID を出さず「削除されたユーザー」にする */
    const file = { ...FIXTURE_FILE, updatedBy: '' };

    expect(resolveFileUpdaters([file])[0].updater).toEqual({ kind: 'DELETED' });
  });

  test('shows unknown for a file without an updater id', () => {
    /** 更新者の ID が無いときは「Unknown」にする。名前があっても ID が無ければ Unknown */
    const file = { ...FIXTURE_FILE, userId: undefined };

    expect(resolveFileUpdaters([file])[0].updater).toEqual({ kind: 'UNKNOWN' });
  });
});
