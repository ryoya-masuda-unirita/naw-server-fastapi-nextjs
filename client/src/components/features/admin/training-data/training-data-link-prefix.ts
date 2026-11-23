import type { AddFileRow } from './training-data-validation';

/**
 * 追加ダイアログの各行の「参照資料のリンク」の先頭に接頭辞を付ける（移植元 `applyLinkPrefix`）。
 * 編集したリンクを残すため、表示名ではなく今のリンクに付ける。
 * ［全体に適用］を押し直したときに同じ接頭辞が重ならないよう、すでにその接頭辞で始まるリンクには付けない。
 *
 * Parameters
 * ----------
 * rows : AddFileRow[]
 *     追加ダイアログの行
 * prefix : string
 *     先頭に付ける文字
 *
 * Returns
 * -------
 * AddFileRow[]
 *     リンクに接頭辞を付けた行
 */
export function applyLinkPrefix(rows: AddFileRow[], prefix: string): AddFileRow[] {
  return rows.map((row) =>
    row.reference.startsWith(prefix) ? row : { ...row, reference: prefix + row.reference },
  );
}
