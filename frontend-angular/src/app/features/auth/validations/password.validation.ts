import { ValidatorFn, Validators } from '@angular/forms';
import { PASSWORD_ASCII_PATTERN, PASSWORD_MAX_LENGTH } from '@core/constants/validation.config';
import { environment } from '@env/environment';

export function passwordAsciiValidator(): ValidatorFn {
  return (control) => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return PASSWORD_ASCII_PATTERN.test(value) ? null : { passwordAscii: true };
  };
}

export function passwordFieldValidators(required = true): ValidatorFn[] {
  const validators: ValidatorFn[] = [
    Validators.minLength(environment.minPasswordLength),
    Validators.maxLength(PASSWORD_MAX_LENGTH),
    passwordAsciiValidator(),
  ];
  if (required) {
    validators.unshift(Validators.required);
  }
  return validators;
}
