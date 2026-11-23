import i18n from 'i18next';
import { useToastStore } from '@/components/shared/toast-store';
import { ApiError } from '@/lib/api-client';

// 移植元でローカル用サーバーへの操作が共通で行う、HTTP 以外の失敗の表示と更新者の取得。
// 学習データ詳細とフィードバックの追加学習が同じ扱いにするため、ここに 1 つだけ置く。

/**
 * ローカル用サーバーへの操作を実行する。
 * ApiError はクラウドの API と同じく共通のエラートーストが出す。接続先が取れない・ユーザーが取れないなど
 * HTTP 以外の失敗は共通のトーストに乗らず何も出ないため、ここで表示する（移植元と同じ）。
 */
export async function viaLocalServer<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      useToastStore.getState().error(i18n.t('COMMON.MESSAGES.ERROR.GENERAL'));
    }
    throw error;
  }
}

/** ローカル用サーバーへ送る更新者。取れないときは更新者なしで送らず、失敗させる */
export function requireUserId(userId: string | undefined): string {
  if (!userId) {
    throw new Error('ログイン中のユーザーが取れないため、ローカル用サーバーへ送れません');
  }
  return userId;
}
