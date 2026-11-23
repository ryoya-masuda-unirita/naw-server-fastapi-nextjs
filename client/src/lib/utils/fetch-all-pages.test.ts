import { describe, expect, test, vi } from 'vitest';
import { FETCH_ALL_PAGE_SIZE, fetchAllPages, type FetchedPage } from './fetch-all-pages';

/** 全 `total` 件の連番を、ページ番号と件数に応じて返す偽の API */
function fakeApi(total: number) {
  return vi.fn(async (page: number, size: number): Promise<FetchedPage<number>> => {
    const start = page * size;
    const items = Array.from(
      { length: Math.max(0, Math.min(size, total - start)) },
      (_, i) => start + i,
    );
    return { items, total };
  });
}

describe('fetchAllPages', () => {
  test('複数ページにまたがる全件を、順番どおり、重複なく返すこと', async () => {
    const api = fakeApi(2500);

    const result = await fetchAllPages(api);

    expect(result).toHaveLength(2500);
    expect(result[0]).toBe(0);
    expect(result[2499]).toBe(2499);
    expect(new Set(result).size).toBe(2500);
    expect(api.mock.calls.map(([page]) => page)).toEqual([0, 1, 2]);
    expect(api.mock.calls.every(([, size]) => size === FETCH_ALL_PAGE_SIZE)).toBe(true);
  });

  test('1 ページに収まるなら、1 回だけ取ること', async () => {
    const api = fakeApi(20);

    expect(await fetchAllPages(api)).toHaveLength(20);
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('ちょうど 1 ページ分の件数のとき、空のページを取りに行かないこと', async () => {
    const api = fakeApi(FETCH_ALL_PAGE_SIZE);

    expect(await fetchAllPages(api)).toHaveLength(FETCH_ALL_PAGE_SIZE);
    expect(api).toHaveBeenCalledTimes(1);
  });

  test('0 件のとき、空の一覧を返すこと', async () => {
    expect(await fetchAllPages(fakeApi(0))).toEqual([]);
  });

  test('取得中に項目が削除されて total に届かなくても、空のページで止まること', async () => {
    // total は 3000 と言うが、実際は 1500 件しかない
    const api = vi.fn(async (page: number, size: number): Promise<FetchedPage<number>> => {
      const start = page * size;
      const items = Array.from(
        { length: Math.max(0, Math.min(size, 1500 - start)) },
        (_, i) => start + i,
      );
      return { items, total: 3000 };
    });

    expect(await fetchAllPages(api)).toHaveLength(1500);
    expect(api).toHaveBeenCalledTimes(3);
  });

  test('ページサイズを指定すると、その件数ずつ取ること', async () => {
    const api = fakeApi(250);

    expect(await fetchAllPages(api, 100)).toHaveLength(250);
    expect(api.mock.calls.map(([, size]) => size)).toEqual([100, 100, 100]);
  });

  test('途中のページの取得に失敗したら、取れた分だけを返さず、失敗にすること', async () => {
    const api = vi.fn(async (page: number): Promise<FetchedPage<number>> => {
      if (page === 1) throw new Error('boom');
      return { items: Array.from({ length: 1000 }, (_, i) => i), total: 2500 };
    });

    await expect(fetchAllPages(api)).rejects.toThrow('boom');
  });
});
