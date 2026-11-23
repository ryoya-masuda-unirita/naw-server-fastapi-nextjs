import { resolveControlError, type FieldErrors } from '@/lib/utils/form-errors';
import type { TranslateFn } from '@/lib/utils/validation';
import { USER_TEXT_MAX_LENGTH } from './user-list.constants';

/**
 * 表示名・ユーザーID のエラー（移植元 `[Validators.required, Validators.maxLength(100)]`）。
 * Angular の required は空文字だけを不正にする（空白だけは通す。API 側が弾く）ので、移植元に合わせて trim しない。
 */
export function getUserTextErrors(value: string): FieldErrors | null {
  if (value === '') return { required: true };
  if (value.length > USER_TEXT_MAX_LENGTH) {
    return { maxlength: { requiredLength: USER_TEXT_MAX_LENGTH } };
  }
  return null;
}

/** 触れたあとの欄にだけ出すエラー文言 */
export function resolveUserTextError(value: string, touched: boolean, t: TranslateFn): string {
  return resolveControlError({ touched, errors: getUserTextErrors(value) }, t);
}
