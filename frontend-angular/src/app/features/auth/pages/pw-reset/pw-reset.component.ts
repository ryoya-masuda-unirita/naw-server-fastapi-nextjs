import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { STORAGE_KEYS } from '@core/constants/storage-keys.config';
import { ToastService } from '@core/services/toast.service';
import { AuthStore } from '@core/stores/auth.store';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import { PwResetNavigationState } from '@features/auth/types';
import { passwordFieldValidators } from '@features/auth/validations/password.validation';
import { pwResetPasswordMatchValidator } from '@features/auth/validations/pw-reset.validation';
import { PASSWORD_MAX_LENGTH } from '@core/constants/validation.config';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, FormInputComponent } from '@shared/components';
import { resolveControlError } from '@shared/utils/form-errors';

@Component({
  selector: 'app-pw-reset',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatIconModule,
    TranslateModule,
    FormInputComponent,
    ButtonComponent,
  ],
  templateUrl: './pw-reset.component.html',
})
export class PwResetComponent implements OnInit {
  readonly authApi = inject(AuthApiService);
  private readonly authStore = inject(AuthStore);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly form = this.fb.nonNullable.group(
    {
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      oldPassword: ['', [Validators.required]],
      newPassword: ['', passwordFieldValidators()],
      confirmPassword: ['', passwordFieldValidators()],
    },
    { validators: pwResetPasswordMatchValidator },
  );

  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });
  private readonly formEvents = toSignal(this.form.events, { initialValue: null });

  private readonly isFormValid = computed(() => this.formStatus() === 'VALID');

  readonly submitError = signal('');
  readonly reasonMessageKey = signal<string | null>(null);
  readonly passwordMaxLength = PASSWORD_MAX_LENGTH;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.submitError.set(''));
  }

  ngOnInit(): void {
    // クエリパラメータから tenantId を取得し、あれば sessionStorage に保存する
    // これにより interceptor が X-Tenant-ID ヘッダーを付与できるようになる
    const tenantId = this.route.snapshot.queryParamMap.get('tenantId');
    if (tenantId) {
      sessionStorage.setItem(STORAGE_KEYS.TENANT_ID, tenantId);
    }

    const state = history.state as PwResetNavigationState;
    if (state?.username) {
      this.form.patchValue({
        username: state.username,
        ...(state.oldPassword ? { oldPassword: state.oldPassword } : {}),
      });
    }
    if (state?.reason === 'INITIAL') {
      this.reasonMessageKey.set('AUTH.PW_RESET.REASON_INITIAL');
    } else if (state?.reason === 'EXPIRED') {
      this.reasonMessageKey.set('AUTH.PW_RESET.REASON_EXPIRED');
    }
  }

  readonly usernameError = computed(() => {
    this.formEvents();
    if (this.submitError()) return this.submitError();
    return this.getError('username');
  });

  readonly oldPasswordError = computed(() => {
    this.formEvents();
    return this.getError('oldPassword');
  });

  readonly newPasswordError = computed(() => {
    this.formEvents();
    return this.getError('newPassword');
  });

  readonly confirmPasswordError = computed(() => {
    this.formEvents();
    const ctrl = this.form.controls.confirmPassword;
    if (ctrl.touched && this.form.hasError('passwordMismatch')) {
      return this.translate.instant('VALIDATION.PASSWORD_MISMATCH');
    }
    return this.getError('confirmPassword');
  });

  private getError(field: 'username' | 'oldPassword' | 'newPassword' | 'confirmPassword'): string {
    return resolveControlError(this.form.controls[field], this.translate);
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (!this.isFormValid()) return;

    const { username, oldPassword, newPassword } = this.form.getRawValue();

    this.submitError.set('');
    try {
      const response = await this.authApi.resetPasswordMutation.mutateAsync({
        username,
        oldPassword,
        newPassword,
      });
      this.toastService.success(this.translate.instant('AUTH.PW_RESET.SUCCESS'));
      await this.authStore.completePasswordReset(response);
    } catch (err) {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 429) {
          this.submitError.set(this.translate.instant('AUTH.LOGIN.PASSWORD_RATELIMIT'));
          return;
        }
        this.submitError.set(err.error?.message ?? '');
      }
    }
  }
}
