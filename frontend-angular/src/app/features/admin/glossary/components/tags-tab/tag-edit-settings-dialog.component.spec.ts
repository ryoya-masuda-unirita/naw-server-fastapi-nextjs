import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, input, output } from '@angular/core';
import { TagEditSettingsDialogComponent } from './tag-edit-settings-dialog.component';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';

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
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-textarea', standalone: true, template: '' })
class FormTextareaStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly badgeText = input<string>('');
  readonly textareaClass = input<string>('');
  readonly valueChange = output<string>();
}

describe('TagEditSettingsDialogComponent', () => {
  let fixture: ComponentFixture<TagEditSettingsDialogComponent>;

  const item: GlossaryTagItem = {
    id: 't1',
    name: 'Tag 1',
    description: 'desc',
    updatedBy: 'u',
    updatedDate: new Date(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagEditSettingsDialogComponent],
    })
      .overrideComponent(TagEditSettingsDialogComponent, {
        set: { imports: [FormInputStub, FormTextareaStub, FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TagEditSettingsDialogComponent);
    fixture.componentRef.setInput('item', item);
    fixture.componentRef.setInput('onValidChange', vi.fn());
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期値としてitemの値がセットされること', () => {
      expect(fixture.componentInstance.name()).toBe('Tag 1');
      expect(fixture.componentInstance.description()).toBe('desc');
    });
  });

  describe('DOM要素表示', () => {
    test('入力コンポーネントが表示されること', () => {
      expect(fixture.debugElement.query(By.directive(FormInputStub))).toBeTruthy();
      expect(fixture.debugElement.query(By.directive(FormTextareaStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('nameが空の時にonValidChange(false)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.setName('');
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(false);
    });

    test('nameが入力されるとonValidChange(true)が呼ばれること', () => {
      const onValidChange = vi.fn();
      fixture.componentRef.setInput('onValidChange', onValidChange);
      fixture.detectChanges();

      fixture.componentInstance.setName('X');
      fixture.detectChanges();
      expect(onValidChange).toHaveBeenLastCalledWith(true);
    });
  });
});
