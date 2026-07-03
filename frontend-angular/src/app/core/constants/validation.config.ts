export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}

export type FormValidationSchema<T extends string> = Record<T, ValidationRule>;

/** パスワード最大文字数（半角ASCII） */
export const PASSWORD_MAX_LENGTH = 64;

/** 印字可能ASCIIのみ（日本語・全角不可） */
export const PASSWORD_ASCII_PATTERN = /^[\x20-\x7E]+$/;

export const VALIDATION_ERROR_KEYS = {
  required: 'VALIDATION.REQUIRED',
  minLength: 'VALIDATION.MIN_LENGTH',
  maxLength: 'VALIDATION.MAX_LENGTH',
  email: 'VALIDATION.EMAIL',
  pattern: 'VALIDATION.PATTERN',
  passwordAscii: 'VALIDATION.PASSWORD_ASCII_ONLY',
} as const;

export const VALIDATION_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^[0-9+\-\s()]+$/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
} as const;
