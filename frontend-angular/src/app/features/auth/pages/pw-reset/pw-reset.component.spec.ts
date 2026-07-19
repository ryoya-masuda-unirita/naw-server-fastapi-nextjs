import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, forwardRef, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import { AuthStore } from '@core/stores/auth.store';
import { ToastService } from '@core/services/toast.service';
import { PwResetComponent } from './pw-reset.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({
  selector: 'app-form-input',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormInputStub), multi: true },
  ],
})
class FormInputStub implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly error = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly type = input<'text' | 'password' | 'email'>('text');
  readonly autocomplete = input<string>('');
  readonly showPasswordToggle = input<boolean>(false);
  readonly maxLength = input<number | null>(null);
  readonly asciiOnly = input<boolean>(false);

  writeValue(_obj: unknown): void {
    /* noop */
  }
  registerOnChange(_fn: unknown): void {
    /* noop */
  }
  registerOnTouched(_fn: unknown): void {
    /* noop */
  }
}

@Component({
  selector: 'app-button',
  standalone: true,
  template: '<ng-content />',
})
class ButtonStub {
  readonly loading = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly iconPosition = input<'left' | 'right'>('right');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly variant = input<string>('solid');
  readonly buttonClick = output<MouseEvent>();
}

describe('PwResetComponent', () => {
  let component: PwResetComponent;
  let fixture: ComponentFixture<PwResetComponent>;

  const mockMutateAsync = vi.fn();
  const mockCompletePasswordReset = vi.fn();
  const mockToastSuccess = vi.fn();
  const mockTranslateInstant = vi.fn((key: string) => key);
  const isPendingSignal = signal(false);

  const FIXTURE_AUTH_SESSION = {
    id: 'admin',
    name: 'Admin',
    role: 'USER' as const,
    token: 'token',
    groups: [{ groupId: 'group-1', groupAdmin: false }],
  };

  const createComponent = (historyState: Record<string, unknown> = {}): void => {
    history.replaceState(historyState, '');
    fixture = TestBed.createComponent(PwResetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(FIXTURE_AUTH_SESSION);
    mockCompletePasswordReset.mockResolvedValue(undefined);
    isPendingSignal.set(false);

    await TestBed.configureTestingModule({
      imports: [PwResetComponent, ReactiveFormsModule, MatIconModule, FakeTranslatePipe],
      providers: [
        {
          provide: AuthApiService,
          useValue: {
            resetPasswordMutation: {
              mutateAsync: mockMutateAsync,
              isPending: isPendingSignal,
            },
          },
        },
        { provide: AuthStore, useValue: { completePasswordReset: mockCompletePasswordReset } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: vi.fn().mockReturnValue(null) } } },
        },
        { provide: ToastService, useValue: { success: mockToastSuccess } },
        {
          provide: TranslateService,
          useValue: {
            instant: mockTranslateInstant,
            get: vi.fn(),
            onLangChange: { subscribe: vi.fn() },
            onTranslationChange: { subscribe: vi.fn() },
            onDefaultLangChange: { subscribe: vi.fn() },
          },
        },
      ],
    })
      .overrideComponent(PwResetComponent, {
        set: {
          imports: [
            ReactiveFormsModule,
            MatIconModule,
            FakeTranslatePipe,
            FormInputStub,
            ButtonStub,
          ],
        },
      })
      .compileComponents();

    createComponent();
  });

  it('パスワード不一致のときAPIを呼ばない', async () => {
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'NewPass123!@',
      confirmPassword: 'Different123!@',
    });
    component.form.updateValueAndValidity();

    await component.onSubmit();

    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('正常系でパスワード更新APIを呼びダッシュボードへ遷移する', async () => {
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'NewPass123!@',
      confirmPassword: 'NewPass123!@',
    });

    await component.onSubmit();

    expect(mockMutateAsync).toHaveBeenCalledWith({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'NewPass123!@',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('AUTH.PW_RESET.SUCCESS');
    expect(mockCompletePasswordReset).toHaveBeenCalledWith(FIXTURE_AUTH_SESSION);
  });

  it('reason が INITIAL のとき初期パスワード向けメッセージを表示する', () => {
    createComponent({ reason: 'INITIAL' });

    expect(component.reasonMessageKey()).toBe('AUTH.PW_RESET.REASON_INITIAL');
    expect(fixture.nativeElement.textContent).toContain('AUTH.PW_RESET.REASON_INITIAL');
  });

  it('reason が EXPIRED のとき有効期限切れ向けメッセージを表示する', () => {
    createComponent({ reason: 'EXPIRED' });

    expect(component.reasonMessageKey()).toBe('AUTH.PW_RESET.REASON_EXPIRED');
    expect(fixture.nativeElement.textContent).toContain('AUTH.PW_RESET.REASON_EXPIRED');
  });

  it('reason がないときメッセージを表示しない', () => {
    createComponent();

    expect(component.reasonMessageKey()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('AUTH.PW_RESET.REASON_INITIAL');
    expect(fixture.nativeElement.textContent).not.toContain('AUTH.PW_RESET.REASON_EXPIRED');
  });

  it('429のときロックアウトメッセージを表示する', async () => {
    mockMutateAsync.mockRejectedValue(
      new HttpErrorResponse({ status: 429, error: { message: 'locked' } }),
    );
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'NewPass123!@',
      confirmPassword: 'NewPass123!@',
    });

    await component.onSubmit();

    expect(component.submitError()).toBe('AUTH.LOGIN.PASSWORD_RATELIMIT');
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('65文字の新パスワードではAPIを呼ばない', async () => {
    const tooLong = `A1!${'a'.repeat(62)}`;
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: tooLong,
      confirmPassword: tooLong,
    });
    component.form.updateValueAndValidity();

    await component.onSubmit();

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(component.form.controls.newPassword.hasError('maxlength')).toBe(true);
  });

  it('日本語を含む新パスワードではAPIを呼ばない', async () => {
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'あAbcd1234!',
      confirmPassword: 'あAbcd1234!',
    });
    component.form.updateValueAndValidity();

    await component.onSubmit();

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(component.form.controls.newPassword.hasError('passwordAscii')).toBe(true);
  });

  it('テナントの最小文字数ポリシーより短い新パスワードでもAPIを呼ぶこと', async () => {
    component.form.setValue({
      username: 'admin',
      oldPassword: 'OldPass123!',
      newPassword: 'ab12',
      confirmPassword: 'ab12',
    });
    component.form.updateValueAndValidity();

    await component.onSubmit();

    expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ newPassword: 'ab12' }));
  });
});
