import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const pwResetPasswordMatchValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const newPassword = control.get('newPassword');
  const confirmPassword = control.get('confirmPassword');

  if (!newPassword || !confirmPassword) {
    return null;
  }

  if (!newPassword.value && !confirmPassword.value) {
    return null;
  }

  if (newPassword.value === confirmPassword.value) {
    return null;
  }

  confirmPassword.setErrors({ passwordMismatch: true });
  return { passwordMismatch: true };
};
