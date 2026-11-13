import { describe, expect, test } from 'vitest';
import type { UserApiItem } from '@/types/admin/user.types';
import type { TrainingDataFile, TrainingDataFileFilter } from '@/types/training-data.types';
import { fileRowToTrainingDataFile } from './training-data-api-normalize';
import { fromSplitLength, toSplitLength } from './training-data-chunk-size';
import {
  buildFileUserFilterOptions,
  formatDateTimeMinutes,
  initialLearningEnabled,
  resolveFileUpdatedByNames,
  toFileListApiParams,
} from './training-data-files-helper';

const FIXTURE_FILTER: TrainingDataFileFilter = {
  query: '',
  userId: '',
  selectedPeriod: null,
  filterPeriodRange: null,
  selectedStatus: null,
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
};

const FIXTURE_USER = { id: 'u1', displayName: '山田太郎' } as UserApiItem;

const FIXTURE_FILE: TrainingDataFile = {
  id: 'f1',
  displayName: '資料',
  updatedAt: '2026-11-01T09:00:00',
  updatedBy: 'u1',
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

  test('自分だけの絞り込みが現在のユーザー ID になること', () => {
    expect(toFileListApiParams({ ...FIXTURE_FILTER, userId: 'me' }, 'self').userId).toBe('self');
    expect(toFileListApiParams({ ...FIXTURE_FILTER, userId: 'u9' }, 'self').userId).toBe('u9');
    expect(toFileListApiParams(FIXTURE_FILTER, 'self').userId).toBeUndefined();
  });

  test('学習設定の ON・OFF が ENABLE・DISABLE になること', () => {
    expect(toFileListApiParams({ ...FIXTURE_FILTER, selectedStatus: 'ON' }).status).toBe('ENABLE');
    expect(toFileListApiParams({ ...FIXTURE_FILTER, selectedStatus: 'OFF' }).status).toBe('DISABLE');
    expect(toFileListApiParams(FIXTURE_FILTER).status).toBeUndefined();
  });

  test('更新者名順は userId で並べ、方向が空なら降順になること', () => {
    const params = toFileListApiParams({ ...FIXTURE_FILTER, sortField: 'updatedBy', sortOrder: '' });

    expect(params.sort).toBe('userId,desc');
  });

  test('ページは 0 始まりで送ること', () => {
    expect(toFileListApiParams({ ...FIXTURE_FILTER, pageIndex: 3 }).page).toBe(2);
  });
});

describe('resolveFileUpdatedByNames', () => {
  test('ユーザー ID を表示名に置き換え、見つからなければそのままにすること', () => {
    const files = [FIXTURE_FILE, { ...FIXTURE_FILE, id: 'f2', userId: 'zzz', updatedBy: 'zzz' }];

    const resolved = resolveFileUpdatedByNames(files, [FIXTURE_USER]);

    expect(resolved[0].updatedBy).toBe('山田太郎');
    expect(resolved[1].updatedBy).toBe('zzz');
  });
});

describe('buildFileUserFilterOptions', () => {
  test('全員・自分だけ・各ユーザーの順に並ぶこと', () => {
    const options = buildFileUserFilterOptions([FIXTURE_USER], (key) => key);

    expect(options.map((option) => option.value)).toEqual(['', 'me', 'u1']);
  });
});

describe('initialLearningEnabled', () => {
  test('ファイルが無いときはオン、あるときはその状態に従うこと', () => {
    expect(initialLearningEnabled(undefined)).toBe(true);
    expect(initialLearningEnabled(FIXTURE_FILE)).toBe(true);
    expect(initialLearningEnabled({ ...FIXTURE_FILE, status: 'DISABLE' })).toBe(false);
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

  test('更新者が無いときはユーザー ID を更新者にすること', () => {
    expect(fileRowToTrainingDataFile(ROW).updatedBy).toBe('u1');
  });

  test('未知の状態は DISABLE として扱うこと', () => {
    expect(fileRowToTrainingDataFile({ ...ROW, status: 'UNKNOWN' }).status).toBe('DISABLE');
  });
});
