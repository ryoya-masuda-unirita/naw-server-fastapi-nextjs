import { AbstractControl, ValidationErrors } from '@angular/forms';
import { TranslateService } from '@ngx-translate/core';

type ErrorResolver = (params: ValidationErrors[string], translate: TranslateService) => string;

const ERROR_RESOLVERS: Record<string, ErrorResolver> = {
  required: (_, t) => t.instant('VALIDATION.REQUIRED'),
  minlength: ({ requiredLength }, t) => t.instant('VALIDATION.MIN_LENGTH', { min: requiredLength }),
  maxlength: ({ requiredLength }, t) => t.instant('VALIDATION.MAX_LENGTH', { max: requiredLength }),
  email: (_, t) => t.instant('VALIDATION.EMAIL'),
  passwordAscii: (_, t) => t.instant('VALIDATION.PASSWORD_ASCII_ONLY'),
};

export function resolveControlError(control: AbstractControl, translate: TranslateService): string {
  if (!control.touched || !control.errors) return '';
  for (const key of Object.keys(control.errors)) {
    const resolver = ERROR_RESOLVERS[key];
    if (resolver) return resolver(control.errors[key], translate);
  }
  return '';
}
