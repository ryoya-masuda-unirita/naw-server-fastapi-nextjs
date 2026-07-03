import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import { passwordFieldValidators } from '@features/auth/validations/password.validation';
import { PASSWORD_MAX_LENGTH } from '@core/constants/validation.config';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, FormInputComponent } from '@shared/components';
import { resolveControlError } from '@shared/utils/form-errors';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    TranslateModule,
    FormInputComponent,
    ButtonComponent,
  ],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  readonly authStore = inject(AuthStore);
  readonly authApi = inject(AuthApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
    password: ['', passwordFieldValidators()],
  });

  readonly passwordMaxLength = PASSWORD_MAX_LENGTH;

  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  private readonly formEvents = toSignal(this.form.events, { initialValue: null });

  private readonly isFormValid = computed(() => this.formStatus() === 'VALID');

  readonly loginError = signal('');

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.loginError.set(''));
  }

  readonly usernameError = computed(() => {
    this.formEvents();
    if (this.loginError()) return this.loginError();
    return this.getError('username');
  });

  readonly passwordError = computed(() => {
    this.formEvents();
    return this.getError('password');
  });

  private getError(field: 'username' | 'password'): string {
    return resolveControlError(this.form.controls[field], this.translate);
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.isFormValid()) return;

    this.loginError.set('');
    const { username, password } = this.form.value;
    try {
      const status = await this.authStore.login({ username: username!, password: password! });
      if (status === 'SUCCESS') {
        this.toastService.success(this.translate.instant('AUTH.LOGIN.SUCCESS'));
      }
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 429) {
          this.loginError.set(this.translate.instant('AUTH.LOGIN.PASSWORD_RATELIMIT'));
        } else if (err.status === 401 || err.status === 403) {
          const message = this.translate.instant('AUTH.LOGIN.ERROR');
          this.loginError.set(message);
          this.toastService.error(message);
        } else {
          this.loginError.set(this.translate.instant('AUTH.LOGIN.UNEXPECTED_ERROR'));
        }
      }
    }
  }

  loginWithGoogle(): void {
    console.log('Login with Google');
  }

  loginWithMicrosoft(): void {
    console.log('Login with Microsoft');
  }

  loginWithEmail(): void {
    console.log('Login with Email');
  }
}
