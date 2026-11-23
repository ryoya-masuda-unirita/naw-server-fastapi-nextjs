import type { SelectOption } from '@/components/shared/types';
import type { RoomFeedbackRating } from '@/types/chat/chat-room.type';
import type { SatisfactionFeedbackItem } from '@/types/admin/feedback.types';

/** 移植元 3 タブの `pageSize` の初期値 */
export const FEEDBACK_PAGE_SIZE = 5;

/** フィルターの「全て」の値。API へは送らない */
export const FILTER_ALL = 'all';

/** 移植元 `feedback.constant.ts` の `satisfactionOptions` */
export function buildSatisfactionOptions(allResponsesLabel: string): SelectOption[] {
  return [
    { value: FILTER_ALL, label: allResponsesLabel },
    { value: 'star1', label: '★☆☆☆☆' },
    { value: 'star2', label: '★★☆☆☆' },
    { value: 'star3', label: '★★★☆☆' },
    { value: 'star4', label: '★★★★☆' },
    { value: 'star5', label: '★★★★★' },
  ];
}

/** 'all' または null/undefined をフィルターなし（undefined）に正規化する */
export function toFilterParam(value: string | null | undefined): string | undefined {
  return value && value !== FILTER_ALL ? value : undefined;
}

const SATISFACTION_TO_RATING: Record<string, RoomFeedbackRating | 'UNRATED'> = {
  star5: 'EXCELLENT',
  star4: 'VERY_GOOD',
  star3: 'GOOD',
  star2: 'AVERAGE',
  star1: 'POOR',
  unrated: 'UNRATED',
};

/** 満足度の選択値（star1〜5）を API の `rating` にする（移植元 `toRoomFeedbackRating`） */
export function toRoomFeedbackRating(
  value: string | null,
): RoomFeedbackRating | 'UNRATED' | undefined {
  return value ? SATISFACTION_TO_RATING[value] : undefined;
}

const RATING_TO_SATISFACTION: Record<RoomFeedbackRating, SatisfactionFeedbackItem['satisfaction']> =
  {
    EXCELLENT: 'star5',
    VERY_GOOD: 'star4',
    GOOD: 'star3',
    AVERAGE: 'star2',
    POOR: 'star1',
  };

/** API の `rating` を一覧の満足度にする（移植元 `toSatisfactionValue`） */
export function toSatisfactionValue(
  rating: RoomFeedbackRating | undefined,
): SatisfactionFeedbackItem['satisfaction'] {
  return rating ? RATING_TO_SATISFACTION[rating] : 'unrated';
}

const SATISFACTION_STARS: Record<string, string> = {
  star5: '★★★★★',
  star4: '★★★★☆',
  star3: '★★★☆☆',
  star2: '★★☆☆☆',
  star1: '★☆☆☆☆',
};

/** 満足度の表示。未評価の文言は呼び出し側で翻訳して渡す（移植元 `getSatisfactionLabel`） */
export function getSatisfactionLabel(satisfaction: string, unratedLabel: string): string {
  if (satisfaction === 'unrated') return unratedLabel;
  return SATISFACTION_STARS[satisfaction] ?? '-';
}

/** 移植元 `resolveAssistantName`。アシスタント名がなければ「不明なアシスタント」にする */
export function resolveAssistantName(
  assistantName: string | null | undefined,
  unknownLabel: string,
): string {
  return assistantName ?? unknownLabel;
}

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
}

function stripMarkdownSyntax(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#-]+/g, ' ');
}

/** 質問・回答の本文を、表のセルに入れる 1 行の文字列にする（HTML タグと Markdown の記号を除く） */
export function toPlainTableCellText(value: string): string {
  const withoutHtml = value.replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(stripMarkdownSyntax(withoutHtml))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * 移植元の `date: 'yyyy/MM/dd HH:mm'`（ローカルタイムゾーン）。
 * 値がない・日付でないときは移植元の `'-'` にする
 */
export function formatUpdatedAt(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 件数表示 `FEEDBACK.PAGE_COUNT` に渡す範囲（移植元 `pageRange`） */
export function buildPageRange(
  page:
    | {
        totalElements: number;
        number: number;
        size: number;
        numberOfElements: number;
      }
    | undefined,
  fallbackSize: number,
): { from: number; to: number; total: number } {
  const total = page?.totalElements ?? 0;
  const pageNumber = page?.number ?? 0;
  const size = page?.size ?? fallbackSize;
  const from = total > 0 ? pageNumber * size + 1 : 0;
  const to = Math.min(from + (page?.numberOfElements ?? 0) - 1, total);
  return { from, to, total };
}
