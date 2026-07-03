import { inject, Injectable } from '@angular/core';
import { VALIDATION_ERROR_KEYS, ValidationRule } from '@core/constants/validation.config';
import { TranslateService } from '@ngx-translate/core';

export interface ValidationResult {
  isValid: boolean;
  error: string;
}

@Injectable({
  providedIn: 'root',
})
export class ValidationService {
  private readonly translate = inject(TranslateService);

  validate(value: string, rule: ValidationRule): ValidationResult {
    const isRequired = rule.required ?? true;

    if (isRequired && (!value || value.trim().length === 0)) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.required),
      };
    }

    if (!value || value.trim().length === 0) {
      return { isValid: true, error: '' };
    }

    if (rule.minLength !== undefined && value.length < rule.minLength) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.minLength, { min: rule.minLength }),
      };
    }

    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.maxLength, { max: rule.maxLength }),
      };
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.pattern),
      };
    }

    return { isValid: true, error: '' };
  }

  validateEmail(value: string, required = true): ValidationResult {
    const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (required && (!value || value.trim().length === 0)) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.required),
      };
    }

    if (value && !emailPattern.test(value)) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.email),
      };
    }

    return { isValid: true, error: '' };
  }

  validateRequired(value: string): ValidationResult {
    if (!value || value.trim().length === 0) {
      return {
        isValid: false,
        error: this.translate.instant(VALIDATION_ERROR_KEYS.required),
      };
    }
    return { isValid: true, error: '' };
  }
}
