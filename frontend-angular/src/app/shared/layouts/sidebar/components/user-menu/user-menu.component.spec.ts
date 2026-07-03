/* eslint-disable @angular-eslint/component-selector */
/* eslint-disable @angular-eslint/directive-selector */
/**
 * `UserMenuComponent` のテスト。
 * `isUserAdmin()`（@core/utils/auth.helpers）が参照するユーザーは sessionStorage の `STORAGE_KEYS.USER`。
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input, Pipe, PipeTransform, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

import { STORAGE_KEYS } from '@core/constants';
import { UserMenuComponent } from './user-menu.component';
import type { UserMenuAction } from '@app-types/layout.type';

// ── Fake translate pipe ──
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ── ContextMenu stub ──
// menuTpl を実際に描画することで、メニュー項目の ngClass（hidden 制御）を検証可能にする
@Component({
  selector: 'app-context-menu',
  standalone: true,
  imports: [CommonModule],
  template: '<ng-container *ngTemplateOutlet="menuTpl()" />',
})
class ContextMenuStub {
  readonly menuTpl = input.required<TemplateRef<unknown>>();
  readonly menuMinWidth = input<string>('min-w-60');
  readonly customTrigger = input<unknown>(null);
  readonly overlayPositions = input<unknown[]>([]);
  close = vi.fn();
  toggle = vi.fn();
}

// ── Default actions factory ──
function createDefaultActions(): UserMenuAction[] {
  return [
    { icon: 'lock', labelKey: 'USER_MENU.PASSWORD_SETTINGS', action: 'password' },
    {
      icon: 'switch_account',
      labelKey: 'USER_MENU.SWITCH_TO_ADMIN',
      action: 'switch-role',
      separator: true,
    },
    { icon: 'logout', labelKey: 'USER_MENU.LOGOUT', action: 'logout', separator: true },
  ];
}

/** 各 `setup` の前に `isUserAdmin()` が読む sessionStorage を用意する */
function seedSessionUser(userData: object | null): void {
  sessionStorage.clear();
  if (userData !== null) {
    sessionStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(userData));
  }
}

describe('UserMenuComponent', () => {
  let component: UserMenuComponent;
  let fixture: ComponentFixture<UserMenuComponent>;

  // 各 it の直前: モック履歴と sessionStorage をリセットする
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  async function setup(userData: object | null = null) {
    seedSessionUser(userData);

    await TestBed.configureTestingModule({
      imports: [UserMenuComponent, NoopAnimationsModule],
    })
      .overrideComponent(UserMenuComponent, {
        set: {
          imports: [CommonModule, MatIconModule, FakeTranslatePipe, ContextMenuStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(UserMenuComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('userMenuActions', createDefaultActions());
    fixture.detectChanges();
  }

  // ── 初期値・ゲッター ──
  describe('初期値・ゲッター', () => {
    test('コンポーネントが作成されること', async () => {
      await setup();
      expect(component).toBeTruthy();
    });

    test('canShowSwitchRole()がfalseを返すこと（sessionStorageにユーザーなし）', async () => {
      await setup(null);
      expect(component.canShowSwitchRole()).toBe(false);
    });

    test('canShowSwitchRole()がfalseを返すこと（roleがUSER）', async () => {
      await setup({ role: 'USER', name: 'テストユーザー', groups: [] });
      expect(component.canShowSwitchRole()).toBe(false);
    });

    test('canShowSwitchRole()がtrueを返すこと（roleがADMIN）', async () => {
      await setup({ role: 'ADMIN', name: '管理者' });
      expect(component.canShowSwitchRole()).toBe(true);
    });

    test('userNameのデフォルト値が空文字であること', async () => {
      await setup();
      expect(component.userName()).toBe('');
    });

    test('avatarUrlのデフォルト値が正しいこと', async () => {
      await setup();
      expect(component.avatarUrl()).toBe('/icons/default-avt-icon.svg');
    });

    test('sidebarCollapsedのデフォルト値がfalseであること', async () => {
      await setup();
      expect(component.sidebarCollapsed()).toBe(false);
    });

    test('userMenuActionsが入力から取得されること', async () => {
      await setup();
      expect(component.userMenuActions().length).toBe(3);
    });
  });

  // ── DOM要素表示 ──
  describe('DOM要素表示', () => {
    test('app-context-menuが表示されること', async () => {
      await setup();
      const contextMenu = fixture.debugElement.query(By.css('app-context-menu'));
      expect(contextMenu).toBeTruthy();
    });

    test('userName inputが設定されると表示が更新されること', async () => {
      await setup();
      fixture.componentRef.setInput('userName', '山田太郎');
      fixture.detectChanges();
      expect(component.userName()).toBe('山田太郎');
    });

    test('avatarUrl inputが設定されると更新されること', async () => {
      await setup();
      fixture.componentRef.setInput('avatarUrl', '/custom-avatar.png');
      fixture.detectChanges();
      expect(component.avatarUrl()).toBe('/custom-avatar.png');
    });

    test('sidebarCollapsed=trueで入力が反映されること', async () => {
      await setup();
      fixture.componentRef.setInput('sidebarCollapsed', true);
      fixture.detectChanges();
      expect(component.sidebarCollapsed()).toBe(true);
    });
  });

  // ── DOM要素イベント ──
  describe('DOM要素イベント', () => {
    test('onMenuAction()がmenuActionイベントを発火すること', async () => {
      await setup();
      const emitted: UserMenuAction[] = [];
      component.menuAction.subscribe((a) => emitted.push(a));

      const action = createDefaultActions()[0];
      component.onMenuAction(action);

      expect(emitted.length).toBe(1);
      expect(emitted[0].action).toBe('password');
    });

    test('onMenuAction()がcontextMenu.close()を呼び出すこと', async () => {
      await setup();
      const closeMock = vi.fn();
      // @ViewChild cannot find the stub, so inject contextMenu directly
      component.contextMenu = {
        close: closeMock,
        toggle: vi.fn(),
      } as unknown as import('@shared/components/context-menu/context-menu.component').ContextMenuComponent;

      component.onMenuAction(createDefaultActions()[0]);

      expect(closeMock).toHaveBeenCalled();
    });

    test('toggle()がstopPropagationを呼び出すこと', async () => {
      await setup();
      const event = { stopPropagation: vi.fn() } as unknown as Event;
      component.toggle(event);
      expect(event.stopPropagation).toHaveBeenCalled();
    });

    test('toggle()がeventなしで呼び出されてもエラーにならないこと', async () => {
      await setup();
      expect(() => component.toggle()).not.toThrow();
    });
  });

  // ── 権限チェック ──
  describe('権限チェック（canShowSwitchRole）', () => {
    test('ADMINロールでcanShowSwitchRole()がtrueを返すこと', async () => {
      await setup({ role: 'ADMIN', name: '管理者' });
      expect(component.canShowSwitchRole()).toBe(true);
    });

    test('グループ管理者のUSERロールでcanShowSwitchRole()がtrueを返すこと', async () => {
      await setup({
        role: 'USER',
        name: 'グループ管理者',
        groups: [{ groupId: '1', groupAdmin: true }],
      });
      expect(component.canShowSwitchRole()).toBe(true);
    });

    test('一般USERロールでcanShowSwitchRole()がfalseを返すこと', async () => {
      await setup({ role: 'USER', name: '一般ユーザー', groups: [] });
      expect(component.canShowSwitchRole()).toBe(false);
    });

    test('sessionStorageが空の場合canShowSwitchRole()がfalseを返すこと', async () => {
      await setup(null);
      expect(component.canShowSwitchRole()).toBe(false);
    });

    test('roleフィールドが不正な場合canShowSwitchRole()がfalseを返すこと', async () => {
      await setup({ role: 'GUEST', name: 'ゲスト' });
      expect(component.canShowSwitchRole()).toBe(false);
    });

    test('roleフィールドが存在しない場合canShowSwitchRole()がfalseを返すこと', async () => {
      await setup({ name: 'ユーザー' });
      expect(component.canShowSwitchRole()).toBe(false);
    });
  });

  // ── 切替項目の表示制御（hidden） ──
  describe('切替項目の表示制御（hidden）', () => {
    function findSwitchRoleButton() {
      return fixture.debugElement
        .queryAll(By.css('button'))
        .find((b) => (b.nativeElement.textContent ?? '').includes('USER_MENU.SWITCH_TO_ADMIN'));
    }

    test('非管理者では切替項目に hidden クラスが付くこと', async () => {
      await setup({ role: 'USER', name: '一般ユーザー', groups: [] });
      const btn = findSwitchRoleButton();
      expect(btn).toBeTruthy();
      expect(btn!.nativeElement.classList).toContain('hidden');
    });

    test('グループ管理者では切替項目に hidden クラスが付かないこと', async () => {
      await setup({
        role: 'USER',
        name: 'グループ管理者',
        groups: [{ groupId: '1', groupAdmin: true }],
      });
      const btn = findSwitchRoleButton();
      expect(btn).toBeTruthy();
      expect(btn!.nativeElement.classList).not.toContain('hidden');
    });

    test('管理者では切替項目に hidden クラスが付かないこと', async () => {
      await setup({ role: 'ADMIN', name: '管理者' });
      const btn = findSwitchRoleButton();
      expect(btn).toBeTruthy();
      expect(btn!.nativeElement.classList).not.toContain('hidden');
    });
  });
});
