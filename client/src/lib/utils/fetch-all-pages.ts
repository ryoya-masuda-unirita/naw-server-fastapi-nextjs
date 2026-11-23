/** ページングする一覧 API の 1 ページ分の結果。 */
export interface FetchedPage<T> {
  items: T[];
  /** 条件に合う全件の件数（Spring の Page の `totalElements` など） */
  total: number;
}

/** 1 回の取得で要求する件数の既定。ほとんどの一覧 API の上限（1,000 件）に合わせる。 */
export const FETCH_ALL_PAGE_SIZE = 1000;

/**
 * ページングする一覧 API を 0 ページ目から順に呼び、全件を返す（移植元 `shared/utils/fetch-all-pages.ts`）。
 * 選択肢の候補を一覧 API から作るときに使う（先頭のページだけで作ると、後ろのページの項目を選べない）。
 * 途中のページの取得に失敗したら、取得できた分だけで候補を作らないよう、失敗のまま返す。
 * ページの境界で重複・漏れが出ないよう、呼び出す API は一意なキーまで並べること（backend が最後に ID を足す）。
 *
 * @param fetchPage ページ番号（0 始まり）と件数を受け取り、そのページの項目と全件の件数を返す関数
 * @param pageSize 1 回に取る件数。backend の上限が 1,000 より小さい API（例: `/admin/all-groups` は 100）には、その上限を渡す
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, size: number) => Promise<FetchedPage<T>>,
  pageSize: number = FETCH_ALL_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; ; page++) {
    const res = await fetchPage(page, pageSize);
    all.push(...res.items);
    // 取得中に項目が削除されると total に届かないまま空のページになるため、空のページでも止める
    if (res.items.length === 0 || all.length >= res.total) {
      return all;
    }
  }
}

/**
 * ページ形式（`{ content, totalElements }`）の応答から、全件の件数を取り出す。
 * 配列そのもの、または `totalElements` がない応答は、その応答の項目数を全件とみなす（1 ページで終わる）。
 */
export function totalElementsOf(raw: unknown, itemCount: number): number {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const total = (raw as { totalElements?: unknown }).totalElements;
    if (typeof total === 'number') return total;
  }
  return itemCount;
}
