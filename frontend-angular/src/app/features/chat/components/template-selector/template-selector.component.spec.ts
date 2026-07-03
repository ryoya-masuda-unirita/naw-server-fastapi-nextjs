import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TemplateSelectorComponent, Template } from './template-selector.component';
import { FakeTranslatePipe } from 'src/testing/fake-translate.pipe';
import { CommonModule } from '@angular/common';

const templates: Template[] = [
  { value: 'tpl1', label: 'テンプレ1', desc: '説明1' },
  { value: 'tpl2', label: 'テンプレ2', desc: '説明2' },
];

describe('TemplateSelectorComponent', () => {
  let fixture: ComponentFixture<TemplateSelectorComponent>;
  let component: TemplateSelectorComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TemplateSelectorComponent, NoopAnimationsModule, FakeTranslatePipe, CommonModule],
      providers: [],
    })
      .overrideComponent(TemplateSelectorComponent, {
        set: { imports: [FakeTranslatePipe, CommonModule] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(TemplateSelectorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('templates', templates);
    fixture.componentRef.setInput('activeTemplate', templates[0]);
    fixture.componentRef.setInput('showBackButton', true);
    fixture.componentRef.setInput('showPreviewImage', false);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('templates, activeTemplate, showBackButton, showPreviewImageが正しいこと', () => {
      expect(component.templates()).toEqual(templates);
      expect(component.activeTemplate()).toEqual(templates[0]);
      expect(component.showBackButton()).toBe(true);
      expect(component.showPreviewImage()).toBe(false);
    });
  });

  describe('DOM要素表示', () => {
    test('テンプレートリストが正しく表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button[role=menuitem]'));
      expect(buttons.length).toBe(2);
      expect(buttons[0].nativeElement.textContent).toContain('テンプレ1');
      expect(buttons[1].nativeElement.textContent).toContain('テンプレ2');
    });
    test('戻るボタンが表示されること', () => {
      const backBtn = fixture.debugElement.query(By.css('button[role=button]'));
      expect(backBtn).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('テンプレート選択ボタンをクリックするとtemplateSelectがemitされること', () => {
      const spy = vi.spyOn(component.templateSelect, 'emit');
      const buttons = fixture.debugElement.queryAll(By.css('button[role=menuitem]'));
      buttons[1].nativeElement.click();
      expect(spy).toHaveBeenCalledWith(templates[1]);
    });
    test('戻るボタンをクリックするとbackがemitされること', () => {
      const spy = vi.spyOn(component.back, 'emit');
      const backBtn = fixture.debugElement.query(By.css('button[role=button]'));
      backBtn.nativeElement.click();
      expect(spy).toHaveBeenCalled();
    });
  });
});
