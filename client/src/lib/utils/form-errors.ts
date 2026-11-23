import { VALIDATION_ERROR_KEYS } from '@/lib/constants/validation';
import type { TranslateFn } from '@/lib/utils/validation';

// 移植元 shared/utils/form-errors.ts。
// 移植元は Angular の AbstractControl（touched・errors）を受け取る。React にはフォームライブラリがないため、
// 同じ形（エラー名 → パラメータ）の状態を受け取り、最初に解決できたエラーの文言を返す。

export type FieldErrors = Record<string, unknown>;

export interface FieldErrorState {
  touched: boolean;
  errors: FieldErrors | null;
}

/** minlength・maxlength のパラメータ（Angular の Validators.minLength と同じ形） */
export interface LengthErrorParams {
  requiredLength: number;
}

type ErrorResolver = (params: unknown, t: TranslateFn) => string;

const ERROR_RESOLVERS: Record<string, ErrorResolver> = {
  required: (_, t) => t(VALIDATION_ERROR_KEYS.required),
  minlength: (params, t) =>
    t(VALIDATION_ERROR_KEYS.minLength, { min: (params as LengthErrorParams).requiredLength }),
  maxlength: (params, t) =>
    t(VALIDATION_ERROR_KEYS.maxLength, { max: (params as LengthErrorParams).requiredLength }),
  email: (_, t) => t(VALIDATION_ERROR_KEYS.email),
  passwordAscii: (_, t) => t(VALIDATION_ERROR_KEYS.passwordAscii),
};

export function resolveControlError(field: FieldErrorState, t: TranslateFn): string {
  if (!field.touched || !field.errors) return '';
  for (const key of Object.keys(field.errors)) {
    const resolver = ERROR_RESOLVERS[key];
    if (resolver) return resolver(field.errors[key], t);
  }
  return '';
}
