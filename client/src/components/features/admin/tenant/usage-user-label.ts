import type { TokenUsageListItem } from '@/types/token-usage.type';

// 移植元 tenant/utils/usage-user-label.util.ts

/**
 * 利用履歴の「利用者」の欄に出すもの。API が返す利用者の種類で決める。
 * 通常のユーザーは名前、SYSTEM ユーザーと、削除されたユーザー（利用者の ID が無い行を含む）は文言を出す。
 * どの場合も、ユーザーの ID や `-` は出さない。
 *
 * @param item 利用履歴の 1 行
 * @param translate 文言のキーを翻訳する関数
 */
export function usageUserLabel(
  item: Pick<TokenUsageListItem, 'userName' | 'userType'>,
  translate: (key: string) => string,
): string {
  switch (item.userType) {
    case 'ACTIVE':
      return item.userName ?? '';
    case 'SYSTEM':
      return translate('TENANT.HISTORY_USER_SYSTEM');
    case 'DELETED':
      return translate('TENANT.HISTORY_USER_DELETED');
  }
}
