import { Component, input, Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgClass } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import { SidebarButtonComponent, RoomMenuEvent } from './sidebar-button.component';
import type { MenuItem } from '@app-types/layout.type';

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

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input.required<string>();
}

@Component({ selector: 'app-icon-button', standalone: true, template: '<ng-content />' })
class IconButtonStub {
  readonly variant = input<string>('primary');
  readonly classProps = input<string>('');
}

const baseItem: MenuItem = {
  labelKey: 'MENU.ITEM',
};

describe('SidebarButtonComponent', () => {
  let fixture: ComponentFixture<SidebarButtonComponent>;
  let component: SidebarButtonComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarButtonComponent],
      providers: [{ provide: TranslateService, useValue: mockTranslate }],
    })
      .overrideComponent(SidebarButtonComponent, {
        set: { imports: [NgClass, FakeTranslatePipe, SvgIconStub, IconButtonStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SidebarButtonComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('item', baseItem);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('sidebarCollapsedのデフォルト値がfalseであること', () => {
      expect(component.sidebarCollapsed()).toBe(false);
    });

    test('itemが正しく設定されること', () => {
      expect(component.item()).toEqual(baseItem);
    });
  });

  describe('DOM要素表示', () => {
    test('ボタン要素が表示されること', () => {
      const btn = fixture.debugElement.query(By.css('button[type="button"]'));
      expect(btn).toBeTruthy();
    });

    test('itemのlabelKeyがボタンのtitleに適用されること', () => {
      const btn = fixture.debugElement.query(By.css('button'));
      expect(btn.nativeElement.title).toBe('MENU.ITEM');
    });

    test('iconがない場合アイコンspanが表示されないこと', () => {
      const iconSpan = fixture.debugElement.query(By.css('.shrink-0'));
      expect(iconSpan).toBeNull();
    });

    test('iconType="svg"の場合app-svg-iconが表示されること', () => {
      fixture.componentRef.setInput('item', { ...baseItem, icon: 'more', iconType: 'svg' });
      fixture.detectChanges();
      const svgIcon = fixture.debugElement.query(By.css('app-svg-icon'));
      expect(svgIcon).toBeTruthy();
    });

    test('iconType="image"の場合imgタグが表示されること', () => {
      fixture.componentRef.setInput('item', {
        ...baseItem,
        icon: '/assets/img.png',
        iconType: 'image',
      });
      fixture.detectChanges();
      const img = fixture.debugElement.query(By.css('img'));
      expect(img).toBeTruthy();
      expect(img.nativeElement.getAttribute('src')).toBe('/assets/img.png');
    });

    test('iconTypeがsvg/image以外の場合innerHTMLでアイコンが表示されること', () => {
      fixture.componentRef.setInput('item', {
        ...baseItem,
        icon: '<b>★</b>',
        iconType: 'material',
      });
      fixture.detectChanges();
      const iconSpan = fixture.debugElement.query(By.css('.shrink-0'));
      expect(iconSpan).toBeTruthy();
    });

    test('sidebarCollapsed=trueの場合ラベルにopacity-0クラスが付与されること', () => {
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      const labelSpan = fixture.debugElement.query(By.css('.flex-1'));
      expect(labelSpan.nativeElement.classList).toContain('opacity-0');
    });

    test('sidebarCollapsed=falseの場合ラベルにopacity-0クラスが付与されないこと', () => {
      fixture.componentRef.setInput('sidebarCollapsed', false);
      fixture.detectChanges();
      const labelSpan = fixture.debugElement.query(By.css('.flex-1'));
      expect(labelSpan.nativeElement.classList).not.toContain('opacity-0');
    });

    test('sidebarCollapsed=trueの場合ピン・メニュー・バッジが非表示になること', () => {
      fixture.componentRef.setInput('item', { ...baseItem, hasPin: true, hasMenu: true, badge: 3 });
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      const iconButton = fixture.debugElement.query(By.css('app-icon-button'));
      const badge = fixture.debugElement.query(By.css('.bg-red-500'));
      expect(iconButton).toBeNull();
      expect(badge).toBeNull();
    });

    test('hasPin=trueかつsidebarCollapsed=falseの場合ピンアイコンが表示されること', () => {
      fixture.componentRef.setInput('item', { ...baseItem, hasPin: true });
      fixture.detectChanges();
      const pinIcon = fixture.debugElement.query(By.css('app-svg-icon'));
      expect(pinIcon).toBeTruthy();
      expect(pinIcon.componentInstance.name()).toBe('push_pin');
    });

    test('hasPin=falseの場合ピンアイコンが表示されないこと', () => {
      const pinIcon = fixture.debugElement.query(By.css('app-svg-icon'));
      expect(pinIcon).toBeNull();
    });

    test('hasMenu=trueかつsidebarCollapsed=falseの場合app-icon-buttonが表示されること', () => {
      fixture.componentRef.setInput('item', { ...baseItem, hasMenu: true });
      fixture.detectChanges();
      const iconButton = fixture.debugElement.query(By.css('app-icon-button'));
      expect(iconButton).toBeTruthy();
    });

    test('hasMenu=falseの場合app-icon-buttonが表示されないこと', () => {
      const iconButton = fixture.debugElement.query(By.css('app-icon-button'));
      expect(iconButton).toBeNull();
    });

    test('badge値がある場合バッジspanに値が表示されること', () => {
      fixture.componentRef.setInput('item', { ...baseItem, badge: 5 });
      fixture.detectChanges();
      const badge = fixture.debugElement.query(By.css('.bg-red-500'));
      expect(badge).toBeTruthy();
      expect(badge.nativeElement.textContent.trim()).toBe('5');
    });

    test('badge値がない場合バッジspanが表示されないこと', () => {
      const badge = fixture.debugElement.query(By.css('.bg-red-500'));
      expect(badge).toBeNull();
    });
  });

  describe('DOM要素イベント', () => {
    test('roomIdがある場合app-icon-buttonクリックでroomMenuOpenedがemitされること', () => {
      fixture.componentRef.setInput('item', {
        ...baseItem,
        hasMenu: true,
        roomId: 'room-123',
        hasPin: false,
      });
      fixture.detectChanges();

      const emitted: RoomMenuEvent[] = [];
      component.roomMenuOpened.subscribe((e) => emitted.push(e));

      const iconButton = fixture.debugElement.query(By.css('app-icon-button'));
      const mouseEvent = new MouseEvent('click');
      iconButton.triggerEventHandler('click', mouseEvent);

      expect(emitted).toHaveLength(1);
      expect(emitted[0].roomId).toBe('room-123');
      expect(emitted[0].event).toBe(mouseEvent);
      expect(emitted[0].isPinned).toBe(false);
    });

    test('hasPinがtrueの場合isPinned=trueでemitされること', () => {
      fixture.componentRef.setInput('item', {
        ...baseItem,
        hasMenu: true,
        roomId: 'room-456',
        hasPin: true,
      });
      fixture.detectChanges();

      const emitted: RoomMenuEvent[] = [];
      component.roomMenuOpened.subscribe((e) => emitted.push(e));

      const iconButton = fixture.debugElement.query(By.css('app-icon-button'));
      iconButton.triggerEventHandler('click', new MouseEvent('click'));

      expect(emitted[0].isPinned).toBe(true);
    });

    test('roomIdがない場合roomMenuOpenedがemitされないこと', () => {
      const emitted: RoomMenuEvent[] = [];
      component.roomMenuOpened.subscribe((e) => emitted.push(e));

      component.onRoomMenuClick(new MouseEvent('click'));

      expect(emitted).toHaveLength(0);
    });
  });
});
