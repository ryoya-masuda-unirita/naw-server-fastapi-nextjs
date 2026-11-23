import { describe, expect, test } from 'vitest';
import type { TrainingDataFileFilter } from '@/types/training-data.types';
import {
  buildLocalServerUrl,
  toLocalFileListParams,
  toLocalFormData,
} from './local-training-api-helper';

const BASE_FILTER: TrainingDataFileFilter = { pageSize: 10, pageIndex: 1 };

function customPeriod(from: string, to: string): TrainingDataFileFilter {
  return {
    ...BASE_FILTER,
    selectedPeriod: 'custom',
    filterPeriodRange: { from, to } as TrainingDataFileFilter['filterPeriodRange'],
  };
}

describe('buildLocalServerUrl', () => {
  test.each([
    [
      'http://host:8090',
      'api/admin/indexes/i1/files',
      'http://host:8090/api/admin/indexes/i1/files',
    ],
    [
      'http://host:8090/',
      'api/admin/indexes/i1/files',
      'http://host:8090/api/admin/indexes/i1/files',
    ],
    [
      'https://host/secuaigent',
      'api/admin/indexes/i1/files',
      'https://host/secuaigent/api/admin/indexes/i1/files',
    ],
    [
      'https://host/secuaigent/',
      'api/admin/indexes/i1/files',
      'https://host/secuaigent/api/admin/indexes/i1/files',
    ],
  ])('joins %s and %s keeping the path of the endpoint', (endpoint, path, expected) => {
    /** 接続先がパスを持っていても残し、末尾の `/` の有無で二重にならない */
    expect(buildLocalServerUrl(endpoint, path)).toBe(expected);
  });
});

describe('toLocalFileListParams', () => {
  test('sends only page, size, the period as dates and the search word', () => {
    /** ローカル用サーバーが受け取る条件だけを送る（更新者・並べ替え・ファイル名・学習設定は送らない） */
    const params = toLocalFileListParams({
      ...customPeriod('2026/11/10', '2026/11/12'),
      pageIndex: 3,
      query: ' 規程 ',
      userId: 'u1',
      sortField: 'updatedBy',
      sortOrder: 'asc',
    });

    expect(params).toEqual({
      page: 2,
      size: 10,
      updatedAtFrom: '2026-11-10',
      updatedAtTo: '2026-11-13',
      displayName: '規程',
    });
  });

  test('omits the period and the search word when they are empty', () => {
    /** 空の条件は送らない */
    expect(toLocalFileListParams({ ...BASE_FILTER, query: '  ' })).toEqual({ page: 0, size: 10 });
  });

  test.each([
    ['2026/01/31', '2026-02-01'],
    ['2026/02/28', '2026-03-01'],
    ['2028/02/28', '2028-02-29'],
    ['2028/02/29', '2028-03-01'],
    ['2026/12/31', '2027-01-01'],
    ['2026-11-30', '2026-12-01'],
  ])('sends the day after %s as the end of the period (%s)', (end, expected) => {
    /** 終了日は「その日の 0:00 以前」で比べられるため翌日を送る（月末・年末・うるう日の繰り上げ） */
    expect(toLocalFileListParams(customPeriod('2026/01/01', end)).updatedAtTo).toBe(expected);
  });

  test('passes through a value that is not a date', () => {
    /** 日付として読めない値は黙って捨てず、ローカル用サーバーの 400 で気づけるようそのまま渡す */
    expect(toLocalFileListParams(customPeriod('abc', 'xyz'))).toMatchObject({
      updatedAtFrom: 'abc',
      updatedAtTo: 'xyz',
    });
  });
});

describe('toLocalFormData', () => {
  test('skips undefined and empty values and keeps the file', () => {
    /** `undefined` と空文字の項目は送らない */
    const file = new File(['x'], 'a.txt');
    const formData = toLocalFormData({
      file,
      name: 'a.txt',
      displayName: '',
      reference: undefined,
      splitLength: '1000',
    });

    expect(formData.get('file')).toBe(file);
    expect(formData.get('name')).toBe('a.txt');
    expect(formData.get('splitLength')).toBe('1000');
    expect(formData.has('displayName')).toBe(false);
    expect(formData.has('reference')).toBe(false);
  });
});
