const ELLIPSIS = '…';

/** 表示するページ番号の並び（移植元 visiblePages）。間を省くところは '…' */
export function getVisiblePages(current: number, total: number, maxVisible: number): (number | string)[] {
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | string)[] = [1];
  const half = Math.floor(maxVisible / 2);
  let start = Math.max(2, current - half + 1);
  let end = Math.min(total - 1, current + half - 1);
  if (current <= half + 1) {
    end = maxVisible - 1;
  }
  if (current >= total - half) {
    start = total - maxVisible + 2;
  }
  if (start > 2) pages.push(ELLIPSIS);
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push(ELLIPSIS);
  if (total > 1) pages.push(total);
  return pages;
}
