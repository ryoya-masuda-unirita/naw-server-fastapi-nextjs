import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { Component, forwardRef, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { AuthStore } from '@core/stores/auth.store';
import { AuthApiService } from '@features/auth/services/auth-api.service';
import { ToastService } from '@core/services/toast.service';
import { LoginComponent } from './login.component';

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

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  const mockLogin = vi.fn().mockResolvedValue('SUCCESS');
  const mockToastSuccess = vi.fn();
  const mockToastError = vi.fn();
  const mockTranslateInstant = vi.fn((key: string) => key);
  const isPendingSignal = signal(false);

  const mockAuthStore = {
    login: mockLogin,
  };

  const mockAuthApi = {
    loginMutation: {
      isPending: isPendingSignal,
    },
  };

  const mockToastService = {
    success: mockToastSuccess,
    error: mockToastError,
  };

  const mockTranslate = {
    instant: mockTranslateInstant,
    get: vi.fn(),
    onLangChange: { subscribe: vi.fn() },
    onTranslationChange: { subscribe: vi.fn() },
    onDefaultLangChange: { subscribe: vi.fn() },
  };

  beforeEach(async () => {
    mockLogin.mockResolvedValue('SUCCESS');
    isPendingSignal.set(false);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthStore, useValue: mockAuthStore },
        { provide: AuthApiService, useValue: mockAuthApi },
        { provide: ToastService, useValue: mockToastService },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(LoginComponent, {
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

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('フォームの初期値が空文字列であること', () => {
      expect(component.form.value).toEqual({ tenantId: '', username: '', password: '' });
    });

    test('初期状態ではtenantIdErrorが空文字列であること', () => {
      expect(component.tenantIdError()).toBe('');
    });

    test('初期状態ではusernameErrorが空文字列であること', () => {
      expect(component.usernameError()).toBe('');
    });

    test('初期状態ではpasswordErrorが空文字列であること', () => {
      expect(component.passwordError()).toBe('');
    });

    test('初期状態ではフォームが無効（INVALID）であること', () => {
      expect(component.form.valid).toBe(false);
    });

    test('パスワードが8文字未満でも文字数エラーが表示されないこと', () => {
      component.form.controls.password.setValue('ab12');
      component.form.controls.password.markAsTouched();
      fixture.detectChanges();
      expect(component.passwordError()).toBe('');
    });
  });

  describe('DOM要素表示', () => {
    test('フォームが表示されること', () => {
      const form = fixture.debugElement.query(By.css('form'));
      expect(form).toBeTruthy();
    });

    test('テナントID・ユーザーID・パスワードのFormInputが3つ表示されること', () => {
      const inputs = fixture.debugElement.queryAll(By.css('app-form-input'));
      expect(inputs.length).toBe(3);
    });

    test('ログインボタンが1つ表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('app-button'));
      expect(buttons.length).toBe(1);
    });

    test('isPendingがtrueのときsubmitボタンにloading=trueが渡されること', () => {
      isPendingSignal.set(true);
      fixture.detectChanges();
      const submitButton = fixture.debugElement.queryAll(By.css('app-button'))[0];
      expect(submitButton.componentInstance.loading()).toBe(true);
    });

    test('isPendingがfalseのときsubmitボタンにloading=falseが渡されること', () => {
      isPendingSignal.set(false);
      fixture.detectChanges();
      const submitButton = fixture.debugElement.queryAll(By.css('app-button'))[0];
      expect(submitButton.componentInstance.loading()).toBe(false);
    });
  });

  describe('DOM要素イベント', () => {
    test('フォームが無効なときonSubmitはauthStore.loginを呼ばないこと', async () => {
      await component.onSubmit();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    test('テナントIDが未入力のときonSubmitはauthStore.loginを呼ばないこと', async () => {
      component.form.setValue({ tenantId: '', username: 'testuser', password: 'password123' });
      await component.onSubmit();
      expect(mockLogin).not.toHaveBeenCalled();
    });

    test('フォームが有効なときonSubmitはauthStore.loginを呼ぶこと', async () => {
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });
      await component.onSubmit();
      expect(mockLogin).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });
    });

    test('パスワードが8文字未満でもonSubmitはauthStore.loginを呼ぶこと', async () => {
      component.form.setValue({ tenantId: 'test-tenant', username: 'testuser', password: 'ab12' });
      await component.onSubmit();
      expect(mockLogin).toHaveBeenCalledWith({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'ab12',
      });
    });

    test('ログイン成功時にtoastService.successが呼ばれること', async () => {
      mockLogin.mockResolvedValue('SUCCESS');
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });
      await component.onSubmit();
      expect(mockToastSuccess).toHaveBeenCalled();
    });

    test('REQUIRES_PASSWORD_RESET時にtoastService.successが呼ばれないこと', async () => {
      mockLogin.mockResolvedValue('REQUIRES_PASSWORD_RESET');
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });
      await component.onSubmit();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    test('429エラー時に特定のメッセージがセットされること', async () => {
      const errorResponse = new HttpErrorResponse({
        status: 429,
        statusText: 'Too Many Requests',
      });
      mockLogin.mockRejectedValue(errorResponse);
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });

      await component.onSubmit();

      expect(component.loginError()).toBe('AUTH.LOGIN.PASSWORD_RATELIMIT');
    });

    test('401エラー時にログイン失敗メッセージがセットされること', async () => {
      const errorResponse = new HttpErrorResponse({
        error: { message: 'Invalid credentials' },
        status: 401,
      });
      mockLogin.mockRejectedValue(errorResponse);
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });

      await component.onSubmit();

      expect(component.loginError()).toBe('AUTH.LOGIN.ERROR');
      expect(mockToastError).toHaveBeenCalledWith('AUTH.LOGIN.ERROR');
    });

    test('403エラー時にログイン失敗メッセージがセットされること', async () => {
      const errorResponse = new HttpErrorResponse({
        error: { message: 'Forbidden' },
        status: 403,
      });
      mockLogin.mockRejectedValue(errorResponse);
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });

      await component.onSubmit();

      expect(component.loginError()).toBe('AUTH.LOGIN.ERROR');
      expect(mockToastError).toHaveBeenCalledWith('AUTH.LOGIN.ERROR');
    });

    test('ログイン失敗時にtoastService.successが呼ばれないこと', async () => {
      mockLogin.mockRejectedValue(new Error('login failed'));
      component.form.setValue({
        tenantId: 'test-tenant',
        username: 'testuser',
        password: 'password123',
      });
      await component.onSubmit();
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    test('フォームのngSubmitイベントでonSubmitが呼ばれること', () => {
      const spy = vi.spyOn(component, 'onSubmit');
      const form = fixture.debugElement.query(By.css('form'));
      form.triggerEventHandler('ngSubmit', null);
      expect(spy).toHaveBeenCalled();
    });
  });
});
