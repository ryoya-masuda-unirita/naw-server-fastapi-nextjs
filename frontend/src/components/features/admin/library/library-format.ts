const COUNT_ZERO_TEXT = '0件';

/** 共有リンクがコピー済みの表示に戻るまでの時間（移植元の setTimeout 3000） */
export const COPIED_RESET_MS = 3000;

const pad = (value: number) => String(value).padStart(2, '0');

/** 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。値がない・日付でないときは空 */
export function formatDateTime(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 移植元 `LibraryStore`・`TagsStore` の `countDisplay`（文言は移植元でもハードコード） */
export function formatCountDisplay(page: number, pageSize: number, total: number): string {
  if (total === 0) return COUNT_ZERO_TEXT;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return `${start}-${end}件 / ${total}件`;
}

/** 移植元の `Math.ceil(total / pageSize) || 1` */
export function calcTotalPages(total: number, pageSize: number): number {
  return Math.ceil(total / pageSize) || 1;
}

/**
 * 共有リンクをクリップボードへコピーする（移植元 `copyLibraryDetailUrl`）。
 * 移植元は結果を待たずに「コピー済み」を出すので、失敗はコンソールにだけ残す。
 */
export function copyText(text: string): void {
  // http など非セキュアな配信では navigator.clipboard 自体がなく、writeText の呼び出しで同期的に落ちる
  if (!navigator.clipboard) {
    console.error('クリップボードを利用できません');
    return;
  }
  navigator.clipboard.writeText(text).catch((error: unknown) => {
    console.error('共有リンクのコピーに失敗しました', error);
  });
}
