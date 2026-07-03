import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Pipe, PipeTransform, PLATFORM_ID } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';

import { ChatContextMenuComponent } from './chat-context-menu.component';

// ── Fake translate pipe ──
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

describe('ChatContextMenuComponent', () => {
  let fixture: ComponentFixture<ChatContextMenuComponent>;
  let component: ChatContextMenuComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatContextMenuComponent, NoopAnimationsModule],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(ChatContextMenuComponent, {
        set: { imports: [MatIconModule, FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatContextMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('isOpen', false);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ── 初期値・ゲッター ──
  describe('初期値・ゲッター', () => {
    test('コンポーネントが作成されること', () => {
      expect(component).toBeTruthy();
    });

    test('visibleの初期値がfalseであること', () => {
      expect(component.visible()).toBe(false);
    });

    test('isOpen=trueにするとvisibleがtrueになること', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      expect(component.visible()).toBe(true);
    });

    test('isDesktop=true時にisOpen=falseになるとvisibleがfalseになること', () => {
      component.isDesktop.set(true);
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      expect(component.visible()).toBe(true);

      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      expect(component.visible()).toBe(false);
    });

    test('isOpen=true時hostClassesにanimate-slide-upが含まれること（モバイル）', () => {
      component.isDesktop.set(false);
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      const classes = component.hostClasses();
      expect(classes['animate-slide-up']).toBe(true);
      expect(classes['animate-slide-down']).toBe(false);
      expect(classes['hidden']).toBe(false);
    });

    test('isOpen=false, visible=trueの時hostClassesにanimate-slide-downが含まれること（モバイル）', () => {
      component.isDesktop.set(false);
      component.visible.set(true);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      const classes = component.hostClasses();
      expect(classes['animate-slide-down']).toBe(true);
      expect(classes['animate-slide-up']).toBe(false);
      expect(classes['hidden']).toBe(false);
    });

    test('isOpen=falseかつvisible=falseの時hiddenがtrueであること', () => {
      component.visible.set(false);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      const classes = component.hostClasses();
      expect(classes['hidden']).toBe(true);
    });

    test('isDesktop=trueの時hostClassesにanimate-slide-upが含まれないこと', () => {
      component.isDesktop.set(true);
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      const classes = component.hostClasses();
      expect(classes['animate-slide-up']).toBe(false);
      expect(classes['animate-slide-down']).toBe(false);
    });
  });

  // ── DOM要素表示 ──
  describe('DOM要素表示', () => {
    test('isOpen=falseかつvisible=falseの時バックドロップが表示されないこと', () => {
      component.visible.set(false);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      const backdrop = fixture.debugElement.query(By.css('.fixed.inset-0'));
      expect(backdrop).toBeNull();
    });

    test('isOpen=trueの時バックドロップが表示されること', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      const backdrop = fixture.debugElement.query(By.css('.fixed.inset-0'));
      expect(backdrop).toBeTruthy();
    });

    test('visible=trueの時バックドロップが表示されること', () => {
      component.visible.set(true);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      const backdrop = fixture.debugElement.query(By.css('.fixed.inset-0'));
      expect(backdrop).toBeTruthy();
    });

    test('メニューパネルが常にDOMに存在すること', () => {
      const panel = fixture.debugElement.query(By.css('.fixed.left-0.bottom-0'));
      expect(panel).toBeTruthy();
    });

    test('ソートボタンと削除ボタンの2つが表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBe(2);
    });

    test('isDesktop=trueの時top styleがchatMenuTopPxの値になること', () => {
      component.isDesktop.set(true);
      fixture.componentRef.setInput('chatMenuTopPx', 120);
      fixture.detectChanges();
      const panel = fixture.debugElement.query(By.css('.fixed.left-0.bottom-0'));
      expect(panel.nativeElement.style.top).toBe('120px');
    });

    test('isDesktop=falseの時top styleが空になること', () => {
      component.isDesktop.set(false);
      fixture.componentRef.setInput('chatMenuTopPx', 120);
      fixture.detectChanges();
      const panel = fixture.debugElement.query(By.css('.fixed.left-0.bottom-0'));
      expect(panel.nativeElement.style.top).toBe('');
    });
  });

  // ── DOM要素イベント ──
  describe('DOM要素イベント', () => {
    test('バックドロップクリックでcloseMenuが発火されること', () => {
      component.visible.set(true);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const emitSpy = vi.fn();
      const sub = component.closeMenu.subscribe(emitSpy);
      const backdrop = fixture.debugElement.query(By.css('.fixed.inset-0'));
      backdrop.triggerEventHandler('click', null);
      expect(emitSpy).toHaveBeenCalledOnce();
      sub.unsubscribe();
    });

    test('ソートボタンクリックでsortが発火されること', () => {
      const emitSpy = vi.fn();
      const sub = component.sort.subscribe(emitSpy);
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      buttons[0].triggerEventHandler('click', null);
      expect(emitSpy).toHaveBeenCalledOnce();
      sub.unsubscribe();
    });

    test('削除ボタンクリックでdeleteSelectedが発火されること', () => {
      const emitSpy = vi.fn();
      const sub = component.deleteSelected.subscribe(emitSpy);
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      buttons[1].triggerEventHandler('click', null);
      expect(emitSpy).toHaveBeenCalledOnce();
      sub.unsubscribe();
    });

    test('メニューパネルクリックでstopPropagationが呼ばれること', () => {
      const panel = fixture.debugElement.query(By.css('.fixed.left-0.bottom-0'));
      const mockEvent = { stopPropagation: vi.fn() };
      panel.triggerEventHandler('click', mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalled();
    });

    test('animationendイベント発火後にvisibleがfalseになること', () => {
      component.visible.set(true);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const panel = fixture.debugElement.query(By.css('.fixed.left-0.bottom-0'));
      panel.nativeElement.dispatchEvent(new Event('animationend'));
      fixture.detectChanges();
      expect(component.visible()).toBe(false);
    });

    test('onAnimationEnd実行時にisOpen=falseならvisibleがfalseになること', () => {
      component.visible.set(true);
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();
      component.onAnimationEnd();
      expect(component.visible()).toBe(false);
    });

    test('onAnimationEnd実行時にisOpen=trueならvisibleが変わらないこと', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();
      component.onAnimationEnd();
      expect(component.visible()).toBe(true);
    });

    test('onSortでsortイベントが発火されること', () => {
      const emitSpy = vi.fn();
      const sub = component.sort.subscribe(emitSpy);
      component.onSort();
      expect(emitSpy).toHaveBeenCalledOnce();
      sub.unsubscribe();
    });

    test('onDeleteSelectedでdeleteSelectedイベントが発火されること', () => {
      const emitSpy = vi.fn();
      const sub = component.deleteSelected.subscribe(emitSpy);
      component.onDeleteSelected();
      expect(emitSpy).toHaveBeenCalledOnce();
      sub.unsubscribe();
    });
  });
});
