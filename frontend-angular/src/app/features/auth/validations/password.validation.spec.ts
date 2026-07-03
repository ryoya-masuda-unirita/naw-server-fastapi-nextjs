import { FormControl } from '@angular/forms';
import { PASSWORD_MAX_LENGTH } from '@core/constants/validation.config';
import {
  passwordAsciiValidator,
  passwordFieldValidators,
} from '@features/auth/validations/password.validation';

const VALID_PASSWORD_64 = `A1!${'a'.repeat(61)}`;

describe('passwordFieldValidators', () => {
  it('64文字の半角ASCIIパスワードは有効', () => {
    const control = new FormControl(VALID_PASSWORD_64, passwordFieldValidators());
    expect(control.valid).toBe(true);
    expect(VALID_PASSWORD_64.length).toBe(PASSWORD_MAX_LENGTH);
  });

  it('65文字はmaxlengthエラー', () => {
    const control = new FormControl(`${VALID_PASSWORD_64}a`, passwordFieldValidators());
    expect(control.hasError('maxlength')).toBe(true);
  });

  it('日本語を含むとpasswordAsciiエラー', () => {
    const control = new FormControl('あAbcd1234!', passwordFieldValidators());
    expect(control.hasError('passwordAscii')).toBe(true);
  });
});

describe('passwordAsciiValidator', () => {
  it('空文字はエラーにしない', () => {
    const control = new FormControl('', passwordAsciiValidator());
    expect(control.valid).toBe(true);
  });
});
