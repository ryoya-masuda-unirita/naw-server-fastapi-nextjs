import { Component, Pipe, PipeTransform, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgClass } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

import { SidebarHeaderSectionComponent } from './sidebar-header-section.component';
import type { SectionGroup } from '@app-types/layout.type';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input.required<string>();
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const defaultSection: SectionGroup = {
  labelKey: 'SIDEBAR.MENU',
  collapsed: false,
  items: [],
};

const chatSection: SectionGroup = {
  labelKey: 'SIDEBAR.CHAT',
  collapsed: false,
  items: [],
};

describe('SidebarHeaderSectionComponent', () => {
  let fixture: ComponentFixture<SidebarHeaderSectionComponent>;
  let component: SidebarHeaderSectionComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarHeaderSectionComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(SidebarHeaderSectionComponent, {
        set: { imports: [NgClass, FakeTranslatePipe, SvgIconStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SidebarHeaderSectionComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('section', defaultSection);
    fixture.componentRef.setInput('sectionIndex', 0);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('sidebarCollapsedのデフォルト値がfalseであること', () => {
      expect(component.sidebarCollapsed()).toBe(false);
    });

    test('sectionIndexが設定した値であること', () => {
      expect(component.sectionIndex()).toBe(0);
    });

    test('sectionが設定した値であること', () => {
      expect(component.section()).toEqual(defaultSection);
    });
  });

  describe('DOM要素表示', () => {
    test('section.labelKeyが翻訳されてspan要素に表示されること', () => {
      const span = fixture.debugElement.query(By.css('span'));
      expect(span.nativeElement.textContent.trim()).toBe('SIDEBAR.MENU');
    });

    test('section.labelKey !== SIDEBAR.CHATのとき、トグルボタンが表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBe(1);
    });

    test('section.labelKey === SIDEBAR.CHATのとき、チャットメニューボタンが表示されること', () => {
      fixture.componentRef.setInput('section', chatSection);
      fixture.detectChanges();
      const buttons = fixture.debugElement.queryAll(By.css('button'));
      expect(buttons.length).toBe(1);
    });

    test('sidebarCollapsed === trueのとき、opacity-0クラスが付与されること', () => {
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      const div = fixture.debugElement.query(By.css('div'));
      expect(div.nativeElement.classList.contains('opacity-0')).toBe(true);
    });

    test('sidebarCollapsed === trueのとき、invisibleクラスが付与されること', () => {
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      const div = fixture.debugElement.query(By.css('div'));
      expect(div.nativeElement.classList.contains('invisible')).toBe(true);
    });

    test('sidebarCollapsed === false かつ labelKey !== SIDEBAR.CHATのとき、cursor-pointerクラスが付与されること', () => {
      const div = fixture.debugElement.query(By.css('div'));
      expect(div.nativeElement.classList.contains('cursor-pointer')).toBe(true);
    });

    test('section.collapsed === falseのとき、arrowUpアイコンが使用されること', () => {
      const svgIcon = fixture.debugElement.query(By.directive(SvgIconStub));
      expect(svgIcon.componentInstance.name()).toBe('arrowUp');
    });

    test('section.collapsed === trueのとき、arrowDownアイコンが使用されること', () => {
      fixture.componentRef.setInput('section', { ...defaultSection, collapsed: true });
      fixture.detectChanges();
      const svgIcon = fixture.debugElement.query(By.directive(SvgIconStub));
      expect(svgIcon.componentInstance.name()).toBe('arrowDown');
    });

    test('section.labelKey === SIDEBAR.CHATのとき、newsortアイコンが使用されること', () => {
      fixture.componentRef.setInput('section', chatSection);
      fixture.detectChanges();
      const svgIcon = fixture.debugElement.query(By.directive(SvgIconStub));
      expect(svgIcon.componentInstance.name()).toBe('newsort');
    });
  });

  describe('DOM要素イベント', () => {
    test('labelKey !== SIDEBAR.CHATのときにヘッダーをクリックするとsectionToggleがemitされること', () => {
      const emitSpy = vi.spyOn(component.sectionToggle, 'emit');
      const div = fixture.debugElement.query(By.css('div'));
      div.triggerEventHandler('click', null);
      expect(emitSpy).toHaveBeenCalledWith(0);
    });

    test('labelKey === SIDEBAR.CHATのときにヘッダーをクリックしてもsectionToggleがemitされないこと', () => {
      fixture.componentRef.setInput('section', chatSection);
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.sectionToggle, 'emit');
      const div = fixture.debugElement.query(By.css('div'));
      div.triggerEventHandler('click', null);
      expect(emitSpy).not.toHaveBeenCalled();
    });

    test('トグルボタンをクリックするとsectionToggleがemitされること', () => {
      const emitSpy = vi.spyOn(component.sectionToggle, 'emit');
      const button = fixture.debugElement.query(By.css('button'));
      const mockEvent = new MouseEvent('click');
      button.triggerEventHandler('click', mockEvent);
      expect(emitSpy).toHaveBeenCalledWith(0);
    });

    test('トグルボタンをクリックするとstopPropagationが呼ばれること', () => {
      const button = fixture.debugElement.query(By.css('button'));
      const mockEvent = new MouseEvent('click');
      const stopPropSpy = vi.spyOn(mockEvent, 'stopPropagation');
      button.triggerEventHandler('click', mockEvent);
      expect(stopPropSpy).toHaveBeenCalled();
    });

    test('labelKey === SIDEBAR.CHATのときにチャットメニューボタンをクリックするとchatMenuOpenedがemitされること', () => {
      fixture.componentRef.setInput('section', chatSection);
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.chatMenuOpened, 'emit');
      const button = fixture.debugElement.query(By.css('button'));
      const mockEvent = new MouseEvent('click');
      button.triggerEventHandler('click', mockEvent);
      expect(emitSpy).toHaveBeenCalledWith(mockEvent);
    });

    test('sectionIndexが1のとき、sectionToggleが1をemitすること', () => {
      fixture.componentRef.setInput('sectionIndex', 1);
      fixture.detectChanges();
      const emitSpy = vi.spyOn(component.sectionToggle, 'emit');
      const div = fixture.debugElement.query(By.css('div'));
      div.triggerEventHandler('click', null);
      expect(emitSpy).toHaveBeenCalledWith(1);
    });
  });
});
