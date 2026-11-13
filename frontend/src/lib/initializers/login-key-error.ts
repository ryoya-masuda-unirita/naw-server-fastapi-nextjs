/** i18next のうち、初期化の完了を待って文言を引くのに使う部分 */
export interface TranslatorLike {
  isInitialized: boolean;
  on: (event: 'initialized', callback: () => void) => void;
  t: (key: string) => string;
}

const LOGIN_KEY_ERROR_KEY = 'AUTH.LOGIN_KEY.ERROR';

/**
 * ログインキーでの認証に失敗したことをエラートーストで知らせる（移植元 login-key.initializer と同じ文言）。
 * 初期化はアプリの起動時に走り、翻訳ファイルの読み込みが終わる前だとキーがそのまま出てしまうため、
 * 移植元が `translate.get` で待つのと同じく、初期化の完了を待ってから文言を引く。
 *
 * Parameters
 * ----------
 * translator : TranslatorLike
 *     i18next のインスタンス。
 * showErrorToast : (message: string) => void
 *     エラートーストを出す関数。
 *
 * Returns
 * -------
 * Promise<void>
 *     トーストを出し終えたら解決する。
 */
export async function notifyLoginKeyError(
  translator: TranslatorLike,
  showErrorToast: (message: string) => void,
): Promise<void> {
  if (!translator.isInitialized) {
    await new Promise<void>((resolve) => translator.on('initialized', resolve));
  }
  showErrorToast(translator.t(LOGIN_KEY_ERROR_KEY));
}
