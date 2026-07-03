import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { Component, Pipe, PipeTransform, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { ActiveFeaturesWidgetComponent } from './active-features-widget.component';
import { Template } from '../template-selector/template-selector.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockTemplate: Template = {
  value: 'tpl-1',
  label: 'テストテンプレート',
  desc: 'テスト説明',
};

describe('ActiveFeaturesWidgetComponent', () => {
  let fixture: ComponentFixture<ActiveFeaturesWidgetComponent>;
  let component: ActiveFeaturesWidgetComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActiveFeaturesWidgetComponent, NoopAnimationsModule],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(ActiveFeaturesWidgetComponent, {
        set: { imports: [CommonModule, FakeTranslatePipe, MatIcon, SvgIconStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ActiveFeaturesWidgetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態でisMultiPanelOpenがfalseであること', () => {
      expect(component.isMultiPanelOpen()).toBe(false);
    });

    test('初期状態でpanelStyleがnullであること', () => {
      expect(component.panelStyle()).toBeNull();
    });

    test('webSearchActive初期値がfalseであること', () => {
      expect(component.webSearchActive()).toBe(false);
    });

    test('templateActive初期値がnullであること', () => {
      expect(component.templateActive()).toBeNull();
    });

    test('activeCount初期値が0であること', () => {
      expect(component.activeCount()).toBe(0);
    });
  });

  describe('DOM要素表示', () => {
    test('activeCount=0の場合、ボタンが表示されないこと', () => {
      fixture.componentRef.setInput('activeCount', 0);
      fixture.detectChanges();

      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBe(0);
    });

    test('activeCount=1かつwebSearchActive=trueの場合、シングルボタンが表示されること', () => {
      fixture.componentRef.setInput('activeCount', 1);
      fixture.componentRef.setInput('webSearchActive', true);
      fixture.detectChanges();

      const button = fixture.debugElement.query(By.css('button.chat-active-button'));
      expect(button).toBeTruthy();
    });

    test('activeCount=1かつtemplateActive設定の場合、テンプレートラベルが表示されること', () => {
      fixture.componentRef.setInput('activeCount', 1);
      fixture.componentRef.setInput('templateActive', mockTemplate);
      fixture.detectChanges();

      const spanEl = fixture.debugElement.query(By.css('span.chat-active-button-text'));
      expect(spanEl.nativeElement.textContent.trim()).toBe('テストテンプレート');
    });

    test('activeCount=2の場合、マルチパネルボタンが表示されること', () => {
      fixture.componentRef.setInput('activeCount', 2);
      fixture.detectChanges();

      const badge = fixture.debugElement.query(By.css('span.chat-active-badge'));
      expect(badge).toBeTruthy();
      expect(badge.nativeElement.textContent.trim()).toBe('2');
    });

    test('isMultiPanelOpen=trueの場合、マルチパネルポップアップが表示されること', () => {
      fixture.componentRef.setInput('activeCount', 2);
      fixture.componentRef.setInput('webSearchActive', true);
      fixture.componentRef.setInput('templateActive', mockTemplate);
      fixture.detectChanges();

      component.isMultiPanelOpen.set(true);
      fixture.detectChanges();

      const panel = fixture.debugElement.query(By.css('[role="menu"]'));
      expect(panel).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('onClearWebSearch()でclearWebSearchイベントが発火すること', () => {
      const emitted: void[] = [];
      component.clearWebSearch.subscribe(() => emitted.push(undefined));

      component.onClearWebSearch();

      expect(emitted.length).toBe(1);
    });

    test('onClearTemplate()でclearTemplateイベントが発火すること', () => {
      const emitted: void[] = [];
      component.clearTemplate.subscribe(() => emitted.push(undefined));

      component.onClearTemplate();

      expect(emitted.length).toBe(1);
    });

    test('onClearFeature("web")でclearFeatureイベントが"web"で発火すること', () => {
      const emitted: ('web' | 'template' | 'library')[] = [];
      component.clearFeature.subscribe((v) => emitted.push(v));

      component.onClearFeature('web');

      expect(emitted).toEqual(['web']);
    });

    test('onClearFeature("template")でclearFeatureイベントが"template"で発火すること', () => {
      const emitted: ('web' | 'template' | 'library')[] = [];
      component.clearFeature.subscribe((v) => emitted.push(v));

      component.onClearFeature('template');

      expect(emitted).toEqual(['template']);
    });

    test('toggleMultiPanel()でisMultiPanelOpenがtrueになること', () => {
      component.toggleMultiPanel();
      expect(component.isMultiPanelOpen()).toBe(true);
    });

    test('toggleMultiPanel()を2回呼ぶとisMultiPanelOpenがfalseに戻ること', () => {
      component.toggleMultiPanel();
      component.toggleMultiPanel();
      expect(component.isMultiPanelOpen()).toBe(false);
    });

    test('closeMultiPanel()でisMultiPanelOpenがfalseになること', () => {
      component.isMultiPanelOpen.set(true);
      component.closeMultiPanel();
      expect(component.isMultiPanelOpen()).toBe(false);
    });

    test('data-chat-multi-wrap外のクリックでパネルが閉じること', () => {
      component.isMultiPanelOpen.set(true);

      const outsideElement = document.createElement('div');
      document.body.appendChild(outsideElement);
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: outsideElement });
      component.onDocumentClick(event);

      expect(component.isMultiPanelOpen()).toBe(false);
      document.body.removeChild(outsideElement);
    });

    test('パネルが閉じている場合はクリックイベントで何も起きないこと', () => {
      component.isMultiPanelOpen.set(false);

      const outsideElement = document.createElement('div');
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: outsideElement });
      component.onDocumentClick(event);

      expect(component.isMultiPanelOpen()).toBe(false);
    });
  });
});
