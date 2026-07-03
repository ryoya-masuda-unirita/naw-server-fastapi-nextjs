import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, TemplateRef, input } from '@angular/core';
import { TagItemMenuComponent } from './tag-item-menu.component';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-context-menu', standalone: true, template: '' })
class ContextMenuStub {
  readonly menuTpl = input<TemplateRef<unknown> | null>(null);
  readonly customTrigger = input<TemplateRef<unknown> | null>(null);
  readonly panelClass = input<string>('');
  readonly menuMinWidth = input<string>('');
  readonly hasPaddingButton = input<boolean>(false);
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class MatIconStub {}

describe('TagItemMenuComponent', () => {
  let fixture: ComponentFixture<TagItemMenuComponent>;

  const item: GlossaryTagItem = {
    id: 't1',
    name: 'Tag 1',
    description: 'desc',
    updatedBy: 'u',
    updatedDate: new Date(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagItemMenuComponent],
    })
      .overrideComponent(TagItemMenuComponent, {
        set: { imports: [ContextMenuStub, MatIconStub, FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TagItemMenuComponent);
    fixture.componentRef.setInput('item', item);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('item inputが設定されること', () => {
      expect(fixture.componentInstance.item()).toEqual(item);
    });
  });

  describe('DOM要素表示', () => {
    test('メニューが描画されること', () => {
      expect(fixture.debugElement.query(By.directive(ContextMenuStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('編集クリックでeditSettingsがemitされること', () => {
      const spy = vi.fn();
      fixture.componentInstance.editSettings.subscribe(spy);

      fixture.componentInstance.onEditSettings(new Event('click'));

      expect(spy).toHaveBeenCalledWith(item);
    });

    test('削除クリックでdeleteItemがemitされること', () => {
      const spy = vi.fn();
      fixture.componentInstance.deleteItem.subscribe(spy);

      fixture.componentInstance.onDelete(new Event('click'));

      expect(spy).toHaveBeenCalledWith(item);
    });
  });
});
