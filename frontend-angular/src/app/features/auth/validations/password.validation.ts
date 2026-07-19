import { ValidatorFn, Validators } from '@angular/forms';
import { PASSWORD_ASCII_PATTERN, PASSWORD_MAX_LENGTH } from '@core/constants/validation.config';

export function passwordAsciiValidator(): ValidatorFn {
  return (control) => {
    const value = control.value as string;
    if (!value) {
      return null;
    }
    return PASSWORD_ASCII_PATTERN.test(value) ? null : { passwordAscii: true };
  };
}

// パスワード文字数の下限はテナントごとの設定でありAPIサーバ側で検証するため、
// クライアント側ではminLengthを課さない (NAW-1113 / NAW-1205)
export function passwordFieldValidators(required = true): ValidatorFn[] {
  const validators: ValidatorFn[] = [
    Validators.maxLength(PASSWORD_MAX_LENGTH),
    passwordAsciiValidator(),
  ];
  if (required) {
    validators.unshift(Validators.required);
  }
  return validators;
}
