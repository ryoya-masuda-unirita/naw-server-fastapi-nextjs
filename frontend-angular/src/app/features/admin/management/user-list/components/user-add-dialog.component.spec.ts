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
import { UserAddDialogComponent } from './user-add-dialog.component';

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
  readonly autocomplete = input<string>('');
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

describe('UserAddDialogComponent', () => {
  let formGroup: FormGroup;
  let fixture: ReturnType<typeof TestBed.createComponent<UserAddDialogComponent>>;

  beforeEach(async () => {
    const fb = new FormBuilder();
    formGroup = fb.nonNullable.group({
      displayName: ['', [Validators.required, Validators.maxLength(100)]],
      userId: ['', [Validators.required, Validators.maxLength(100)]],
      loginKey: ['', [Validators.maxLength(100)]],
      role: ['user', [Validators.required]],
    });

    const mockTranslate = { instant: vi.fn((key: string) => key) };

    await TestBed.configureTestingModule({
      imports: [UserAddDialogComponent, NoopAnimationsModule, ReactiveFormsModule],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(UserAddDialogComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            ReactiveFormsModule,
            FormInputStub,
            FormRadioStub,
            ButtonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserAddDialogComponent);
    fixture.componentRef.setInput('formGroup', formGroup);
    fixture.detectChanges();
  });

  describe('初期表示', () => {
    test('パスワード入力欄が表示されないこと', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[formcontrolname="password"]')).toBeNull();
      expect(compiled.querySelector('[formcontrolname="confirmPassword"]')).toBeNull();
    });

    test('ログインキー入力欄が表示されること', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[formcontrolname="loginKey"]')).not.toBeNull();
    });
  });

  describe('バリデーション', () => {
    test('表示名を入力しないと作成できないこと', () => {
      formGroup.get('displayName')?.markAsTouched();
      fixture.detectChanges();
      expect(formGroup.get('displayName')?.invalid).toBe(true);
    });

    test('ユーザーIDを入力しないと作成できないこと', () => {
      formGroup.get('userId')?.markAsTouched();
      fixture.detectChanges();
      expect(formGroup.get('userId')?.invalid).toBe(true);
    });

    test('ログインキーを入力しなくても作成できること', () => {
      expect(formGroup.get('loginKey')?.valid).toBe(true);
    });
  });

  describe('ログインキー再生成', () => {
    test('再生成するとランダムな16文字の英数字が設定されること', () => {
      formGroup.get('loginKey')?.setValue('');
      fixture.componentInstance.regenerateLoginKey();
      const value = formGroup.get('loginKey')?.value as string;
      expect(value).toMatch(/^[A-Za-z0-9]{16}$/);
    });

    test('再生成のたびに異なる値になること', () => {
      fixture.componentInstance.regenerateLoginKey();
      const first = formGroup.get('loginKey')?.value as string;
      fixture.componentInstance.regenerateLoginKey();
      const second = formGroup.get('loginKey')?.value as string;
      expect(first).not.toBe(second);
    });
  });
});
