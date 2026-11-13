import {
  PASSWORD_ASCII_PATTERN,
  PASSWORD_MAX_LENGTH,
  VALIDATION_ERROR_KEYS,
} from '@/lib/constants/validation';
import type { TranslateFn } from '@/lib/utils/validation';

// 移植元 features/auth（login.component.ts・pw-reset.component.ts・validations/）の入力チェック。
// 移植元は Angular の Validators を使い、エラーの並びは「必須 → 最小 → 最大 → 半角」。最初のエラーだけを欄の下に出す

/** ログインID（ユーザーID）の最小文字数（移植元 Validators.minLength(3)） */
export const USERNAME_MIN_LENGTH = 3;
/** ログインID（ユーザーID）の最大文字数（移植元 Validators.maxLength(50)） */
export const USERNAME_MAX_LENGTH = 50;

/**
 * 必須チェック。Angular の `Validators.required` と同じく、空文字だけを未入力とみなす（空白のみは通す）。
 *
 * @param value 入力値
 * @param t 翻訳関数
 * @returns エラー文言。問題なければ空文字
 */
export function validateRequiredField(value: string, t: TranslateFn): string {
  return value === '' ? t(VALIDATION_ERROR_KEYS.required) : '';
}

/**
 * ログインIDのチェック（必須・3〜50 文字）。
 *
 * @param value 入力値
 * @param t 翻訳関数
 * @returns エラー文言。問題なければ空文字
 */
export function validateUsername(value: string, t: TranslateFn): string {
  const required = validateRequiredField(value, t);
  if (required) return required;
  if (value.length < USERNAME_MIN_LENGTH) {
    return t(VALIDATION_ERROR_KEYS.minLength, { min: USERNAME_MIN_LENGTH });
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return t(VALIDATION_ERROR_KEYS.maxLength, { max: USERNAME_MAX_LENGTH });
  }
  return '';
}

/**
 * パスワード欄のチェック（必須・最大 64 文字・半角英数字記号のみ）。
 * 最小文字数はテナントごとの設定で backend が検証するため課さない（移植元 NAW-1113 / NAW-1205）。
 *
 * @param value 入力値
 * @param t 翻訳関数
 * @returns エラー文言。問題なければ空文字
 */
export function validatePasswordField(value: string, t: TranslateFn): string {
  const required = validateRequiredField(value, t);
  if (required) return required;
  if (value.length > PASSWORD_MAX_LENGTH) {
    return t(VALIDATION_ERROR_KEYS.maxLength, { max: PASSWORD_MAX_LENGTH });
  }
  if (!PASSWORD_ASCII_PATTERN.test(value)) {
    return t(VALIDATION_ERROR_KEYS.passwordAscii);
  }
  return '';
}
