import { VALIDATION_ERROR_KEYS, VALIDATION_PATTERNS, type ValidationRule } from '@/lib/constants/validation';

// 移植元 core/utils/validation.service.ts。
// 移植元は TranslateService を inject するが、React では翻訳関数（useTranslation の t）を引数で受け取る。

export interface ValidationResult {
  isValid: boolean;
  error: string;
}

export type TranslateFn = (key: string, options?: Record<string, unknown>) => string;

const VALID: ValidationResult = { isValid: true, error: '' };

function isBlank(value: string): boolean {
  return !value || value.trim().length === 0;
}

function invalid(error: string): ValidationResult {
  return { isValid: false, error };
}

export function validate(value: string, rule: ValidationRule, t: TranslateFn): ValidationResult {
  const isRequired = rule.required ?? true;

  if (isRequired && isBlank(value)) {
    return invalid(t(VALIDATION_ERROR_KEYS.required));
  }
  if (isBlank(value)) {
    return VALID;
  }
  if (rule.minLength !== undefined && value.length < rule.minLength) {
    return invalid(t(VALIDATION_ERROR_KEYS.minLength, { min: rule.minLength }));
  }
  if (rule.maxLength !== undefined && value.length > rule.maxLength) {
    return invalid(t(VALIDATION_ERROR_KEYS.maxLength, { max: rule.maxLength }));
  }
  if (rule.pattern && !rule.pattern.test(value)) {
    return invalid(t(VALIDATION_ERROR_KEYS.pattern));
  }
  return VALID;
}

export function validateEmail(value: string, t: TranslateFn, required = true): ValidationResult {
  if (required && isBlank(value)) {
    return invalid(t(VALIDATION_ERROR_KEYS.required));
  }
  if (value && !VALIDATION_PATTERNS.email.test(value)) {
    return invalid(t(VALIDATION_ERROR_KEYS.email));
  }
  return VALID;
}

export function validateRequired(value: string, t: TranslateFn): ValidationResult {
  if (isBlank(value)) {
    return invalid(t(VALIDATION_ERROR_KEYS.required));
  }
  return VALID;
}
