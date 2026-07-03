import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { TagItem } from '@app-types/admin/library.types';
import {
  TAG_NAME_MAX_LENGTH,
  TagEditSettingsDialogComponent,
} from './tag-edit-settings-dialog.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-form-input', standalone: true, template: '' })
class FormInputStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-textarea', standalone: true, template: '' })
class FormTextareaStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly badgeText = input<string>('');
  readonly areaHeight = input<number>();
  readonly valueChange = output<string>();
}

describe('TagEditSettingsDialogComponent', () => {
  let fixture: ComponentFixture<TagEditSettingsDialogComponent>;

  const mockTranslate = {
    instant: vi.fn((key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    ),
    onLangChange: { subscribe: vi.fn() },
    onTranslationChange: { subscribe: vi.fn() },
    onDefaultLangChange: { subscribe: vi.fn() },
  };

  const item: TagItem = {
    id: 't1',
    name: 'Tag 1',
    description: 'desc',
    updatedAt: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    mockTranslate.instant.mockClear();

    await TestBed.configureTestingModule({
      imports: [TagEditSettingsDialogComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(TagEditSettingsDialogComponent, {
        set: { imports: [FormInputStub, FormTextareaStub, FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TagEditSettingsDialogComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('onValidChange', vi.fn());
    fixture.componentRef.setInput('onValueChange', vi.fn());
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値', () => {
    test('itemの値が初期値としてセットされること', () => {
      expect(fixture.componentInstance.name()).toBe('Tag 1');
      expect(fixture.componentInstance.description()).toBe('desc');
    });

    test('tagNameMaxLengthが255であること', () => {
      expect(fixture.componentInstance.tagNameMaxLength).toBe(TAG_NAME_MAX_LENGTH);
      expect(TAG_NAME_MAX_LENGTH).toBe(255);
    });
  });

  describe('DOM要素表示', () => {
    test('入力コンポーネントが表示されること', () => {
      expect(fixture.debugElement.query(By.directive(FormInputStub))).toBeTruthy();
      expect(fixture.debugElement.query(By.directive(FormTextareaStub))).toBeTruthy();
    });

    test('form-inputにmaxLengthが渡されること', () => {
      const formInput = fixture.debugElement.query(By.directive(FormInputStub))
        .componentInstance as FormInputStub;
      expect(formInput.maxLength()).toBe(TAG_NAME_MAX_LENGTH);
    });
  });

  describe('バリデーション', () => {
    test('nameが空の時にonValidChange(false)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('');
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(false);
    });

    test('nameが空白のみの時にonValidChange(false)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('   ');
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(false);
    });

    test('nameが入力されるとonValidChange(true)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('新タグ');
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(true);
    });

    test('nameが255文字の時にonValidChange(true)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('a'.repeat(TAG_NAME_MAX_LENGTH));
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(true);
    });

    test('nameが256文字の時にonValidChange(false)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('a'.repeat(TAG_NAME_MAX_LENGTH + 1));
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(false);
    });

    test('nameが255文字以内の時にnameErrorが空であること', () => {
      fixture.componentInstance.name.set('a'.repeat(TAG_NAME_MAX_LENGTH));
      fixture.detectChanges();
      expect(fixture.componentInstance.nameError()).toBe('');
    });

    test('nameが256文字の時にnameErrorが表示されること', () => {
      fixture.componentInstance.name.set('a'.repeat(TAG_NAME_MAX_LENGTH + 1));
      fixture.detectChanges();

      expect(mockTranslate.instant).toHaveBeenCalledWith('VALIDATION.MAX_LENGTH', {
        max: TAG_NAME_MAX_LENGTH,
      });
      expect(fixture.componentInstance.nameError()).toContain('VALIDATION.MAX_LENGTH');

      const formInput = fixture.debugElement.query(By.directive(FormInputStub))
        .componentInstance as FormInputStub;
      expect(formInput.error()).toContain('VALIDATION.MAX_LENGTH');
    });
  });

  describe('値の通知', () => {
    test('nameとdescriptionが変更されるとonValueChangeが呼ばれること', () => {
      const onValueChange = vi.fn();
      fixture.componentRef.setInput('onValueChange', onValueChange);
      fixture.detectChanges();

      fixture.componentInstance.name.set('更新タグ');
      fixture.componentInstance.description.set('更新説明');
      fixture.detectChanges();

      expect(onValueChange).toHaveBeenLastCalledWith('更新タグ', '更新説明');
    });
  });
});
