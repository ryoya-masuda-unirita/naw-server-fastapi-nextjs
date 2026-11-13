import type { SelectOption } from '@/components/shared/types';

/** 移植元 `assistant-list.constants.ts` の ASSISTANT_SERVER_TYPE */
export const ASSISTANT_SERVER_TYPE = {
  SECURE: 'SECURE',
  SAAS_CHAT: 'SAAS_CHAT',
  SAAS_RAG: 'SAAS_RAG',
} as const;

/**
 * 接続サーバーの選択肢。ラベルは移植元が日本語を直書きしているため、同じ文言をそのまま持つ
 * （辞書に対応するキーがなく、画面の移植で辞書にキーを足さない方針のため）。
 */
export const ASSISTANT_SERVER_OPTIONS: SelectOption[] = [
  { value: ASSISTANT_SERVER_TYPE.SECURE, label: 'セキュア' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_CHAT, label: 'クラウド(一般)' },
  { value: ASSISTANT_SERVER_TYPE.SAAS_RAG, label: 'クラウド(学習先指定)' },
];

/** 「カテゴリなし」「所属チームなし」の選択肢の値。backend が未設定・未所属の絞り込みとして扱う */
export const NONE_OPTION_VALUE = 'NONE';

/** 移植元 `AssistantListStore` が絞り込みの先頭に足す選択肢（日本語の直書きも移植元どおり） */
export const NO_CATEGORY_OPTION: SelectOption = { value: NONE_OPTION_VALUE, label: 'カテゴリなし' };
export const NO_TEAM_OPTION: SelectOption = { value: NONE_OPTION_VALUE, label: '所属チームなし' };

/** 1 ページの件数（移植元の初期値） */
export const ASSISTANT_PAGE_SIZE = 10;

/**
 * 件数表示（移植元 `countDisplay`。日本語の直書きを移植元どおり持つ）。
 * 0 件なら `0件`、それ以外は `1-10件 / 25件` の形。`pageIndex` は 0 始まり。
 */
export function formatCountDisplay(pageIndex: number, pageSize: number, total: number): string {
  if (total === 0) return '0件';
  const start = pageIndex * pageSize + 1;
  const end = Math.min((pageIndex + 1) * pageSize, total);
  return `${start}-${end}件 / ${total}件`;
}
