const LOGIN_KEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const LOGIN_KEY_LENGTH = 16;

/**
 * ランダムな英数字のログインキーを生成する。
 * 任意文字列の指定を廃止し、常にこの関数で生成した値を設定する。
 */
export function generateLoginKey(length = LOGIN_KEY_LENGTH): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += LOGIN_KEY_ALPHABET[bytes[i] % LOGIN_KEY_ALPHABET.length];
  }
  return result;
}
