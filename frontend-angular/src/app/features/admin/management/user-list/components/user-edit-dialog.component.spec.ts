import {
  Component,
  forwardRef,
  input,
  output,
  Pipe,
  PipeTransform,
  TemplateRef,
} from '@angular/core';
import {
  ControlValueAccessor,
  FormBuilder,
  FormGroup,
  NG_VALUE_ACCESSOR,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { vi, describe, test, expect, beforeEach } from 'vitest';
import { TranslateService } from '@ngx-translate/core';
import { UserEditDialogComponent } from './user-edit-dialog.component';

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
  readonly label = input<string>('');
  readonly error = input<string>('');
  readonly supportText = input<string>('');
  readonly warning = input<string>('');
  readonly placeholder = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly readOnly = input<boolean>(false, { alias: 'readonly' });
  readonly endAdornment = input<TemplateRef<unknown>>();
  readonly value = input<string>('');
  readonly valueChange = output<string>();
  readonly blurChange = output<void>();
  writeValue(_v: unknown): void {}
  registerOnChange(_fn: unknown): void {}
  registerOnTouched(_fn: unknown): void {}
}

@Component({
  selector: 'app-form-radio',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormRadioStub), multi: true },
  ],
})
class FormRadioStub implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly supportText = input<string>('');
  readonly options = input<unknown[]>([]);
  readonly layout = input<string>('vertical');
  readonly value = input<unknown>(undefined);
  readonly valueChange = output<string>();
  writeValue(_v: unknown): void {}
  registerOnChange(_fn: unknown): void {}
  registerOnTouched(_fn: unknown): void {}
}

@Component({
  selector: 'app-form-switch',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormSwitchStub), multi: true },
  ],
})
class FormSwitchStub implements ControlValueAccessor {
  readonly label = input<string>('');
  readonly switchLabel = input<string>('');
  writeValue(_v: unknown): void {}
  registerOnChange(_fn: unknown): void {}
  registerOnTouched(_fn: unknown): void {}
}

@Component({
  selector: 'app-button',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly disabled = input<boolean>(false);
  readonly buttonClick = output<MouseEvent>();
}

describe('UserEditDialogComponent', () => {
  let formGroup: FormGroup;
  let fixture: ReturnType<typeof TestBed.createComponent<UserEditDialogComponent>>;

  beforeEach(async () => {
    const fb = new FormBuilder();
    formGroup = fb.nonNullable.group({
      displayName: ['テストユーザー', [Validators.required, Validators.maxLength(100)]],
      userId: [{ value: 'test-user', disabled: true }],
      loginKey: ['test-login-key', [Validators.maxLength(100)]],
      role: ['user', [Validators.required]],
      resetPassword: [false],
    });

    const mockTranslate = { instant: vi.fn((key: string) => key) };

    await TestBed.configureTestingModule({
      imports: [UserEditDialogComponent, NoopAnimationsModule, ReactiveFormsModule],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(UserEditDialogComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            ReactiveFormsModule,
            FormInputStub,
            FormRadioStub,
            FormSwitchStub,
            ButtonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserEditDialogComponent);
    fixture.componentRef.setInput('formGroup', formGroup);
    fixture.detectChanges();
  });

  describe('初期表示', () => {
    test('パスワード入力欄が表示されないこと', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[formcontrolname="password"]')).toBeNull();
      expect(compiled.querySelector('[formcontrolname="confirmPassword"]')).toBeNull();
    });

    test('リセットスイッチの初期状態がオフであること', () => {
      expect(formGroup.get('resetPassword')?.value).toBe(false);
    });

    test('ログインキー入力欄が表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[formcontrolname="loginKey"]')).not.toBeNull();
    });
  });

  describe('バリデーション', () => {
    test('表示名を空にすると保存できないこと', () => {
      formGroup.get('displayName')?.setValue('');
      formGroup.get('displayName')?.markAsTouched();
      fixture.detectChanges();
      expect(formGroup.get('displayName')?.invalid).toBe(true);
    });

    test('ログインキーを空にしても保存できること', () => {
      formGroup.get('loginKey')?.setValue('');
      expect(formGroup.get('loginKey')?.valid).toBe(true);
    });
  });

  describe('ログインキー再生成', () => {
    test('再生成すると既存値からランダムな16文字の英数字に変わること', () => {
      fixture.componentInstance.regenerateLoginKey();
      const value = formGroup.get('loginKey')?.value as string;
      expect(value).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(value).not.toBe('test-login-key');
    });
  });
});
