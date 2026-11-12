/* eslint-disable @angular-eslint/component-selector */
/* eslint-disable @angular-eslint/directive-selector */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  Component,
  Directive,
  Input,
  input,
  output,
  signal,
  Pipe,
  PipeTransform,
  WritableSignal,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router, NavigationEnd, RouterEvent } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { QueryClient } from '@tanstack/angular-query-experimental';

import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

import { SidebarComponent } from './sidebar.component';
import { I18nService } from '@core/i18n/i18n.service';
import { AuthStore } from '@core/stores/auth.store';
import { UiStore } from '@core/stores/ui.store';
import { UserService } from '@core/services/user.service';
import { ChatService } from '@features/chat/services/chat.service';

import type { LayoutConfig, MenuItem, SectionGroup, UserMenuAction } from '@app-types/layout.type';

// ── Fake translate pipe ──
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ── Router directive stubs ──
@Component({ selector: 'router-outlet', standalone: true, template: '' })
class RouterOutletStub {}

@Directive({ selector: '[routerLink]', standalone: true })
class RouterLinkStub {
  @Input() routerLink: string | string[] = '';
}

@Directive({ selector: '[routerLinkActive]', standalone: true })
class RouterLinkActiveStub {
  @Input() routerLinkActive: string | string[] = '';
}

// ── Child component stubs ──
@Component({ selector: 'app-admin-sidebar', standalone: true, template: '' })
class AdminSidebarStub {}

@Component({ selector: 'app-back-sidebar', standalone: true, template: '' })
class BackSidebarStub {
  readonly goToBack = output<void>();
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly buttonClick = output<void>();
}

@Component({ selector: 'app-new-chat-dialog', standalone: true, template: '' })
class NewChatDialogStub {
  readonly selectedAssistantId = input.required<WritableSignal<string | null>>();
}

@Component({ selector: 'app-chat-context-menu', standalone: true, template: '' })
class ChatContextMenuStub {
  readonly isOpen = input.required<boolean>();
  readonly chatMenuTopPx = input<number>(0);
  readonly sort = output<void>();
  readonly deleteSelected = output<void>();
  readonly closeMenu = output<void>();
}

@Component({ selector: 'app-chat-room-menu', standalone: true, template: '' })
class ChatRoomMenuStub {
  readonly isOpen = input.required<boolean>();
  readonly isPinned = input<boolean>(false);
  readonly topPx = input<number>(0);
  readonly triggerTopPx = input<number>(0);
  readonly rename = output<void>();
  readonly togglePin = output<void>();
  readonly delete = output<void>();
  readonly closeMenu = output<void>();
}

@Component({ selector: 'app-user-menu', standalone: true, template: '' })
class UserMenuStub {
  readonly userMenuActions = input.required<unknown[]>();
  readonly userName = input<string>('');
  readonly avatarUrl = input<string>('');
  readonly sidebarCollapsed = input<boolean>(false);
  readonly buttonClass = input<string>('');
  readonly menuAction = output<unknown>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-icon-button', standalone: true, template: '' })
class IconButtonStub {}

@Component({ selector: 'app-sidebar-header-section', standalone: true, template: '' })
class SidebarHeaderSectionStub {
  readonly section = input.required<SectionGroup>();
  readonly sectionIndex = input.required<number>();
  readonly sidebarCollapsed = input<boolean>(false);
  readonly sectionToggle = output<number>();
  readonly chatMenuOpened = output<MouseEvent>();
}

@Component({ selector: 'app-sidebar-route-button', standalone: true, template: '' })
class SidebarRouteButtonStub {
  readonly item = input.required<MenuItem>();
  readonly sidebarCollapsed = input<boolean>(false);
  readonly iconComponents = input<Record<string, unknown>>({});
  readonly roomMenuOpened = output<{ event: MouseEvent; roomId: string; isPinned: boolean }>();
}

@Component({ selector: 'app-sidebar-button', standalone: true, template: '' })
class SidebarButtonStub {
  readonly item = input.required<MenuItem>();
  readonly sidebarCollapsed = input<boolean>(false);
  readonly roomMenuOpened = output<{ event: MouseEvent; roomId: string; isPinned: boolean }>();
}

// ── Mock services ──
const mockAuthStore = {
  userName: signal('TestUser'),
  user: signal<{ name: string; role?: string } | null>({ name: 'TestUser' }),
  isAdmin: vi.fn(() => true),
  isGroupAdmin: vi.fn(() => false),
  isGroupAdminOnly: vi.fn(() => false),
  logout: vi.fn(),
};

const mockUiStore = {
  sidebarCollapsed: signal(false),
  sidebarMobileOpen: signal(false),
  isAdminMode: signal(false),
  isBackMode: signal(false),
  toggleSidebar: vi.fn(),
  closeMobileSidebar: vi.fn(),
  enterAdminMode: vi.fn(),
  exitAdminMode: vi.fn(),
  enterBackSidebarMode: vi.fn(),
  exitLibraryDetailMode: vi.fn(),
  exitResetSidebarMode: vi.fn(),
};

const mockLocation = {
  back: vi.fn(),
};

const mockChatService = {
  allRooms: signal<{ id: string; name: string; isPinned: boolean }[]>([]),
  isCreatingRoom: signal(false),
  isAllRoomsLoading: signal(false),
  isRenamingRoom: signal(false),
  isReorderingRooms: signal(false),
  isDeletingRoom: signal(false),
  getAllRooms: vi.fn().mockResolvedValue(undefined),
  loadNextRoomsPage: vi.fn(),
  createNewRoom: vi.fn().mockResolvedValue('new-room-id'),
  renameRoom: vi.fn().mockResolvedValue(undefined),
  togglePinRoom: vi.fn().mockResolvedValue(undefined),
  deleteRoom: vi.fn().mockResolvedValue(undefined),
  startNewChat: vi.fn(),
};

const mockUserService = {
  getProfile: vi.fn().mockResolvedValue({
    id: 'mock-user-id',
    loginId: 'test@example.com',
    name: 'テスト ユーザー',
    role: 'USER',
    loginKey: null,
  }),
  updateProfile: vi.fn().mockResolvedValue(undefined),
  isUpdatingProfile: signal(false),
};

const routerEvents$ = new Subject<RouterEvent>();
const mockRouter = {
  events: routerEvents$.asObservable(),
  url: '/admin/dashboard',
  navigate: vi.fn(),
};

const mockDialogRef = {
  afterClosed: vi.fn().mockReturnValue(new Subject()),
  close: vi.fn(),
};

const mockDialog = {
  open: vi.fn().mockReturnValue(mockDialogRef),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  use: vi.fn(),
  currentLang: 'ja',
  defaultLang: 'ja',
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockI18nService = {
  resolveLanguage: vi.fn(() => 'ja'),
  setLanguage: vi.fn().mockResolvedValue(undefined),
};

const mockQueryClient = {
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
};

// ── Default config factory ──
function createDefaultConfig(): LayoutConfig {
  return {
    role: 'admin',
    dashboardRoute: '/admin/dashboard',
    chatNewRoute: '/admin/chat/new',
    chatSearchRoute: '/admin/chat/search',
    chatRoomRoute: (roomId: string) => `/admin/chat/${roomId}`,
    libraryRoute: '/admin/library',
    adminRoute: '/admin/management',
    adminTenantRoute: '/admin/management/tenant',
    externalSiteUrl: 'https://ranabase.com',
    adminTitleMap: {
      '/admin/management/tenant': 'ADMIN_CONSOLE.WORKSPACE_SETTINGS',
      '/admin/management': 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
    },
    actionItems: [
      { icon: 'add', labelKey: 'SIDEBAR.NEW_CHAT', route: '#new-chat' },
      { icon: 'search', labelKey: 'SIDEBAR.SEARCH_CHAT', route: '#search' },
    ],
    sectionGroups: [
      {
        labelKey: 'SIDEBAR.MENU',
        collapsed: false,
        items: [
          {
            icon: 'dashboard',
            iconType: 'material',
            labelKey: 'SIDEBAR.DASHBOARD',
            route: '/admin/dashboard',
          },
          {
            icon: 'auto_stories',
            iconType: 'material',
            labelKey: 'SIDEBAR.LIBRARY',
            route: '/admin/library',
          },
        ],
      },
    ],
    userMenuActions: [
      { icon: 'lock', labelKey: 'USER_MENU.PASSWORD_SETTINGS', action: 'password' },
      { icon: 'logout', labelKey: 'USER_MENU.LOGOUT', action: 'logout', separator: true },
    ],
  };
}

describe('SidebarComponent', () => {
  let component: SidebarComponent;
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    // Mock localStorage for the test environment
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => store[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((k) => delete store[k]);
      }),
    });

    // Reset signals
    mockUiStore.sidebarCollapsed = signal(false);
    mockUiStore.sidebarMobileOpen = signal(false);
    mockUiStore.isAdminMode = signal(false);
    mockUiStore.isBackMode = signal(false);
    mockAuthStore.userName = signal('TestUser');
    mockAuthStore.user = signal({ name: 'TestUser' });
    mockChatService.allRooms = signal([]);
    mockChatService.isCreatingRoom = signal(false);
    mockChatService.isAllRoomsLoading = signal(false);

    await TestBed.configureTestingModule({
      imports: [SidebarComponent, NoopAnimationsModule],
      providers: [
        { provide: AuthStore, useValue: mockAuthStore },
        { provide: UiStore, useValue: mockUiStore },
        { provide: ChatService, useValue: mockChatService },
        { provide: UserService, useValue: mockUserService },
        { provide: Router, useValue: mockRouter },
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: I18nService, useValue: mockI18nService },
        { provide: Location, useValue: mockLocation },
        { provide: QueryClient, useValue: mockQueryClient },
      ],
    })
      .overrideComponent(SidebarComponent, {
        set: {
          imports: [
            CommonModule,
            RouterOutletStub,
            RouterLinkStub,
            RouterLinkActiveStub,
            MatIconModule,
            MatMenuModule,
            FakeTranslatePipe,
            AdminSidebarStub,
            BackSidebarStub,
            ButtonStub,
            NewChatDialogStub,
            ChatContextMenuStub,
            ChatRoomMenuStub,
            UserMenuStub,
            SvgIconStub,
            IconButtonStub,
            SidebarHeaderSectionStub,
            SidebarRouteButtonStub,
            SidebarButtonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(SidebarComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('config', createDefaultConfig());
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ── 初期値・ゲッター ──
  describe('初期値・ゲッター', () => {
    test('通常画面でサイドバーと「新しいチャット」「チャットを検索」が表示されること', () => {
      expect(fixture.debugElement.query(By.css('aside'))).toBeTruthy();
      const text = fixture.nativeElement.textContent ?? '';
      expect(text).toContain('SIDEBAR.NEW_CHAT');
      expect(text).toContain('SIDEBAR.SEARCH_CHAT');
    });

    test('管理者ロールのとき管理者として認識されること', () => {
      expect(component.isAdmin()).toBe(true);
    });

    test('一般ユーザーロールのとき管理者として認識されないこと', () => {
      const userConfig = createDefaultConfig();
      userConfig.role = 'user';
      fixture.componentRef.setInput('config', userConfig);
      fixture.detectChanges();
      expect(component.isAdmin()).toBe(false);
    });

    test('「新しいチャット」と「チャットを検索」ボタンが表示されること', () => {
      expect(component.actionItems().length).toBe(2);
      expect(component.actionItems()[0].labelKey).toBe('SIDEBAR.NEW_CHAT');
    });

    test('ユーザーメニューに操作項目が表示されること', () => {
      expect(component.userMenuActions().length).toBe(2);
    });

    test('チャット一覧がルーム情報から構築されること', () => {
      mockChatService.allRooms.set([
        { id: 'r1', name: 'Room 1', isPinned: false },
        { id: 'r2', name: 'Room 2', isPinned: true },
      ]);
      fixture.detectChanges();

      const section = component.chatSection();
      expect(section.labelKey).toBe('SIDEBAR.CHAT');
      expect(section.items.length).toBe(2);
      expect(section.items[0].labelKey).toBe('Room 1');
      expect(section.items[1].hasPin).toBe(true);
    });

    test('サイドバーにナビゲーションとチャットのセクションが含まれること', () => {
      const groups = component.allSectionGroups();
      expect(groups.length).toBe(2); // 1 static + 1 chat
      expect(groups[0].labelKey).toBe('SIDEBAR.MENU');
      expect(groups[1].labelKey).toBe('SIDEBAR.CHAT');
    });

    test('言語が日本語のとき「日本語」と表示されること', () => {
      expect(component.currentLanguageDisplay()).toBe('日本語');
    });

    test('言語が英語のとき「English」と表示されること', () => {
      component.currentLanguage.set('en');
      expect(component.currentLanguageDisplay()).toBe('English');
    });

    test('初期状態でメニューがすべて閉じていること', () => {
      expect(component.userName()).toBe('');
      expect(component.newChatAssistantId()).toBeNull();
      expect(component.chatMenuOpen()).toBe(false);
      expect(component.mobileMenuOpen()).toBe(false);
    });
  });

  // ── DOM要素表示 ──
  describe('DOM要素表示', () => {
    test('デフォルトモードでサイドバーが表示されること', () => {
      const aside = fixture.debugElement.query(By.css('aside'));
      expect(aside).toBeTruthy();
    });

    test('ユーザー名がユーザーメニューに表示されること', () => {
      const userMenuEl = fixture.debugElement.query(By.css('app-user-menu'));
      expect(userMenuEl).toBeTruthy();
      expect(userMenuEl.componentInstance.userName()).toBe('TestUser');
    });

    test('サイドバーの操作ボタンが表示されること', () => {
      const buttons = fixture.debugElement.queryAll(By.css('.shrink-0.mb-6 button'));
      expect(buttons.length).toBe(2);
    });

    test('ナビゲーションとチャット一覧のセクションが表示されること', () => {
      const sections = fixture.debugElement.queryAll(By.css('.flex-1.overflow-y-auto .mb-6'));
      expect(sections.length).toBe(2); // MENU + CHAT
    });

    test('ラナベースモードでラナベースサイドバーが表示されること', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', createDefaultConfig());
      fixture.detectChanges();

      const adminSidebar = fixture.debugElement.query(By.css('app-admin-sidebar'));
      expect(adminSidebar).toBeTruthy();
    });

    test('バックモードでバックサイドバーが表示されること', () => {
      mockUiStore.isAdminMode = signal(false);
      mockUiStore.isBackMode = signal(true);
      fixture.componentRef.setInput('config', createDefaultConfig());
      fixture.detectChanges();

      const backSidebar = fixture.debugElement.query(By.css('app-back-sidebar'));
      expect(backSidebar).toBeTruthy();
    });

    test('チャットコンテキストメニューが表示されること', () => {
      const menu = fixture.debugElement.query(By.css('app-chat-context-menu'));
      expect(menu).toBeTruthy();
    });

    test('チャットルームメニューが表示されること', () => {
      const menu = fixture.debugElement.query(By.css('app-chat-room-menu'));
      expect(menu).toBeTruthy();
    });

    test('コンテンツ領域が表示されること', () => {
      const outlet = fixture.debugElement.query(By.css('router-outlet'));
      expect(outlet).toBeTruthy();
    });
  });

  // ── DOM要素イベント ──
  describe('DOM要素イベント', () => {
    test('ナビゲーションセクションを折りたためること', () => {
      expect(component.allSectionGroups()[0].collapsed).toBe(false);
      component.toggleSection(0);
      expect(component.allSectionGroups()[0].collapsed).toBe(true);
    });

    test('チャットセクションを折りたためること', () => {
      expect(component.chatSection().collapsed).toBe(false);
      component.toggleSection(1); // index 1 = chat section (after 1 static)
      expect(component.chatSection().collapsed).toBe(true);
    });

    test('チャットメニューを開けること', () => {
      const mockEvent = {
        currentTarget: { getBoundingClientRect: () => ({ bottom: 100 }) },
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent;

      component.openChatMenu(mockEvent);
      expect(component.chatMenuOpen()).toBe(true);
      expect(component.chatMenuTopPx()).toBe(104);
    });

    test('チャットメニューを閉じられること', () => {
      component.chatMenuOpen.set(true);
      component.closeChatMenu();
      expect(component.chatMenuOpen()).toBe(false);
    });

    test('言語を日本語から英語に切り替えられること', async () => {
      expect(component.currentLanguage()).toBe('ja');
      component.toggleLanguage();
      await vi.waitFor(() => expect(component.currentLanguage()).toBe('en'));
      expect(mockI18nService.setLanguage).toHaveBeenCalledWith('en');
    });

    test('言語を英語から日本語に切り替えられること', async () => {
      component.currentLanguage.set('en');
      component.toggleLanguage();
      await vi.waitFor(() => expect(component.currentLanguage()).toBe('ja'));
      expect(mockI18nService.setLanguage).toHaveBeenCalledWith('ja');
    });

    test('新規チャットボタンからダイアログを開けること', () => {
      const item: MenuItem = { labelKey: 'SIDEBAR.NEW_CHAT', icon: 'add' };
      component.onActionItemClick(item);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('検索ボタンから検索モーダルを開けること', () => {
      const item: MenuItem = { labelKey: 'SIDEBAR.SEARCH_CHAT', icon: 'search' };
      component.onActionItemClick(item);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('パスワード設定メニューからパスワード設定画面に遷移できること', () => {
      const action: UserMenuAction = {
        icon: 'lock',
        labelKey: 'USER_MENU.PASSWORD_SETTINGS',
        action: 'password',
      };
      component.onUserMenuAction(action);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/password/reset']);
    });

    test('ログアウトメニューから確認ダイアログを開けること', () => {
      const action: UserMenuAction = {
        icon: 'logout',
        labelKey: 'USER_MENU.LOGOUT',
        action: 'logout',
      };
      component.onUserMenuAction(action);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('管理コンソールに移動できること', () => {
      component.navigateToAdmin();
      expect(mockUiStore.enterAdminMode).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/management/tenant']);
    });

    test('チャットに戻れること', () => {
      component.backToChat();
      expect(mockUiStore.exitAdminMode).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('ライブラリ一覧に戻れること', () => {
      component.backToLibraryList();
      expect(mockUiStore.exitLibraryDetailMode).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/library']);
    });

    test('削除ダイアログを開けること', () => {
      component.openDeleteDialog();
      expect(component.chatMenuOpen()).toBe(false);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ソートダイアログを開けること', () => {
      component.openSortDialog();
      expect(component.chatMenuOpen()).toBe(false);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('チャットルームのメニューを開けること', () => {
      const mockEvent = {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        currentTarget: { getBoundingClientRect: () => ({ bottom: 200 }) },
      } as unknown as MouseEvent;

      component.openRoomMenu(mockEvent, 'room-1', true);
      const state = component.roomMenuState();
      expect(state.isOpen).toBe(true);
      expect(state.roomId).toBe('room-1');
      expect(state.isPinned).toBe(true);
      expect(state.topPx).toBe(204);
    });

    test('チャットルームのメニューを閉じられること', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.closeRoomMenu();
      expect(component.roomMenuState().isOpen).toBe(false);
    });

    test('チャットルームをピン留めできること', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.onTogglePinRoom();
      expect(mockChatService.togglePinRoom).toHaveBeenCalledWith({ id: 'r1', isPinned: false });
    });

    test('ルームが選択されていない場合ピン操作がされないこと', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: null,
        topPx: 0,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.onTogglePinRoom();
      expect(mockChatService.togglePinRoom).not.toHaveBeenCalled();
    });

    test('チャットルーム名の変更ダイアログを開けること', () => {
      mockChatService.allRooms.set([{ id: 'r1', name: 'My Room', isPinned: false }]);
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.onRenameRoom();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ルームが選択されていない場合名前変更がされないこと', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: null,
        topPx: 0,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.onRenameRoom();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    test('空白のみのルーム名では renameRoom を呼ばないこと', () => {
      mockChatService.allRooms.set([{ id: 'r1', name: 'My Room', isPinned: false }]);
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      mockDialog.open.mockClear();
      mockChatService.renameRoom.mockClear();
      component.onRenameRoom();

      const dialogData = mockDialog.open.mock.calls.at(-1)?.[1]?.data as {
        contentComponentInputs?: { actionBridge?: { name: WritableSignal<string> } };
        confirmDisabledSignal?: () => boolean;
        confirmAction?: () => void;
      };
      dialogData.contentComponentInputs?.actionBridge?.name.set('   ');

      expect(dialogData.confirmDisabledSignal?.()).toBe(true);
      dialogData.confirmAction?.();
      expect(mockChatService.renameRoom).not.toHaveBeenCalled();
    });

    test('前後の空白を除去したルーム名で renameRoom を呼ぶこと', () => {
      mockChatService.allRooms.set([{ id: 'r1', name: 'My Room', isPinned: false }]);
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      mockDialog.open.mockClear();
      mockChatService.renameRoom.mockClear();
      component.onRenameRoom();

      const dialogData = mockDialog.open.mock.calls.at(-1)?.[1]?.data as {
        contentComponentInputs?: { actionBridge?: { name: WritableSignal<string> } };
        confirmDisabledSignal?: () => boolean;
        confirmAction?: () => void;
      };
      dialogData.contentComponentInputs?.actionBridge?.name.set('  新しい名前  ');

      expect(dialogData.confirmDisabledSignal?.()).toBe(false);
      dialogData.confirmAction?.();
      expect(mockChatService.renameRoom).toHaveBeenCalledWith('r1', '新しい名前');
    });

    test('チャットルームの削除確認ダイアログを開けること', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.openConfirmDeleteDialog();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ルームが選択されていない場合削除確認がされないこと', () => {
      component.roomMenuState.set({
        isOpen: true,
        roomId: null,
        topPx: 0,
        triggerTopPx: 0,
        isPinned: false,
      });
      mockDialog.open.mockClear();
      component.openConfirmDeleteDialog();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });

    test('表示中のチャットを削除すると新規チャット画面に遷移すること', async () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/r1', '/admin/chat/r1'));
      fixture.detectChanges();

      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r1',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.openConfirmDeleteDialog();

      const dialogData = mockDialog.open.mock.calls.at(-1)?.[1]?.data as {
        confirmAction?: () => void;
      };
      dialogData.confirmAction?.();
      await vi.waitFor(() => expect(mockChatService.deleteRoom).toHaveBeenCalledWith('r1'));

      expect(mockChatService.startNewChat).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('表示中以外のチャットを削除しても画面が遷移しないこと', async () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/r1', '/admin/chat/r1'));
      fixture.detectChanges();

      component.roomMenuState.set({
        isOpen: true,
        roomId: 'r2',
        topPx: 100,
        triggerTopPx: 0,
        isPinned: false,
      });
      component.openConfirmDeleteDialog();

      const dialogData = mockDialog.open.mock.calls.at(-1)?.[1]?.data as {
        confirmAction?: () => void;
      };
      dialogData.confirmAction?.();
      await vi.waitFor(() => expect(mockChatService.deleteRoom).toHaveBeenCalledWith('r2'));

      expect(mockChatService.startNewChat).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('表示中のチャットを一括削除すると新規チャット画面に遷移すること', () => {
      const afterClosed$ = new Subject<string[] | null>();
      mockDialog.open.mockReturnValueOnce({
        ...mockDialogRef,
        afterClosed: vi.fn().mockReturnValue(afterClosed$),
      });
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/r1', '/admin/chat/r1'));
      fixture.detectChanges();

      component.openDeleteDialog();
      afterClosed$.next(['r1', 'r2']);

      expect(mockChatService.startNewChat).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('表示中以外のチャットを一括削除しても画面が遷移しないこと', () => {
      const afterClosed$ = new Subject<string[] | null>();
      mockDialog.open.mockReturnValueOnce({
        ...mockDialogRef,
        afterClosed: vi.fn().mockReturnValue(afterClosed$),
      });
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/r1', '/admin/chat/r1'));
      fixture.detectChanges();

      component.openDeleteDialog();
      afterClosed$.next(['r2']);

      expect(mockChatService.startNewChat).not.toHaveBeenCalled();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('アシスタントを選択せずに作成しようとしても新規チャットが作成されないこと', () => {
      component.newChatAssistantId.set(null);
      component.confirmNewChat();
      expect(mockChatService.createNewRoom).not.toHaveBeenCalled();
    });

    test('新規チャット作成をキャンセルできること', () => {
      component.cancelNewChat();
      // no error thrown (dialogRef is null initially)
    });

    test('セクションが展開時にアイテム数に応じた高さになること', () => {
      const section = {
        labelKey: 'TEST',
        collapsed: false,
        items: [{} as MenuItem, {} as MenuItem],
      };
      expect(component.getSectionHeight(section)).toBe('72px'); // 2 * 36
    });

    test('セクションが折りたたみ時に高さが0になること', () => {
      const section = { labelKey: 'TEST', collapsed: true, items: [{} as MenuItem] };
      expect(component.getSectionHeight(section)).toBe('0');
    });

    test('管理コンソールモードで管理コンソールのタイトルが表示されること', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', createDefaultConfig());
      fixture.detectChanges();
      // currentRoute is '/admin/dashboard' by default, doesn't match admin routes
      expect(component.pageTitleKey()).toBe('ADMIN_CONSOLE.MANAGEMENT_CONSOLE');
    });

    test('デフォルトモードでページタイトルが表示されること', () => {
      expect(component.pageTitleKey()).toBe('PAGE.INVENTORY_OPTIMIZATION');
    });

    test('チャット画面ではヘッダーが非表示になること', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/room-1', '/admin/chat/room-1'));
      fixture.detectChanges();
      expect(component.hideHeader()).toBe(true);
    });

    test('検索画面ではヘッダーが表示されること', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/search', '/admin/chat/search'));
      fixture.detectChanges();
      expect(component.hideHeader()).toBe(false);
    });
  });

  // ── 管理者切替メニュー（switch-role） ──
  describe('管理者切替メニュー（switch-role）', () => {
    function configWithSwitchRole(): LayoutConfig {
      const cfg = createDefaultConfig();
      cfg.userMenuActions = [
        { icon: 'compare_arrows', labelKey: 'USER_MENU.SWITCH_TO_ADMIN', action: 'switch-role' },
        { icon: 'logout', labelKey: 'USER_MENU.LOGOUT', action: 'logout', separator: true },
      ];
      return cfg;
    }

    test('チャット画面では切替ラベルが「管理者画面に切替」になること', () => {
      mockUiStore.isAdminMode = signal(false);
      fixture.componentRef.setInput('config', configWithSwitchRole());
      fixture.detectChanges();
      const item = component.userMenuActions().find((a) => a.action === 'switch-role');
      expect(item?.labelKey).toBe('USER_MENU.SWITCH_TO_ADMIN');
    });

    test('管理者画面では切替ラベルが「チャット画面に切替」になること', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', configWithSwitchRole());
      fixture.detectChanges();
      const item = component.userMenuActions().find((a) => a.action === 'switch-role');
      expect(item?.labelKey).toBe('USER_MENU.SWITCH_TO_CHAT');
    });

    test('switch-role 以外の項目はラベルが変更されないこと', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', configWithSwitchRole());
      fixture.detectChanges();
      const logout = component.userMenuActions().find((a) => a.action === 'logout');
      expect(logout?.labelKey).toBe('USER_MENU.LOGOUT');
    });

    test('チャット画面で切替すると管理者画面に遷移すること', () => {
      mockUiStore.isAdminMode = signal(false);
      fixture.componentRef.setInput('config', configWithSwitchRole());
      fixture.detectChanges();
      component.onUserMenuAction({
        icon: 'compare_arrows',
        labelKey: 'USER_MENU.SWITCH_TO_ADMIN',
        action: 'switch-role',
      });
      expect(mockUiStore.enterAdminMode).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/management/tenant']);
    });

    test('管理者画面で切替するとチャット画面に遷移すること', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', configWithSwitchRole());
      fixture.detectChanges();
      component.onUserMenuAction({
        icon: 'compare_arrows',
        labelKey: 'USER_MENU.SWITCH_TO_CHAT',
        action: 'switch-role',
      });
      expect(mockUiStore.exitAdminMode).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin/chat/new']);
    });

    test('管理者モードでもSecuAiGentロゴが表示されること', () => {
      mockUiStore.isAdminMode = signal(true);
      fixture.componentRef.setInput('config', createDefaultConfig());
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('img[alt="SecuAiGent"]'))).toBeTruthy();
    });
  });

  // ── アシスタント/テンプレートの再取得 ──
  describe('アシスタント/テンプレートの再取得', () => {
    test('ダッシュボード画面に遷移するとアシスタント一覧とテンプレート一覧が再取得されること', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/dashboard', '/admin/dashboard'));
      fixture.detectChanges();

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['assistants'] });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['prompt-templates'],
      });
    });

    test('新規チャット画面に遷移するとアシスタント一覧とテンプレート一覧が再取得されること', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/new', '/admin/chat/new'));
      fixture.detectChanges();

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['assistants'] });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['prompt-templates'],
      });
    });

    test('チャットルーム画面など対象外の画面に遷移した場合は再取得されないこと', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/chat/room-1', '/admin/chat/room-1'));
      fixture.detectChanges();

      expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled();
    });

    test('クエリパラメータが付与されていてもダッシュボード遷移として再取得されること', () => {
      routerEvents$.next(
        new NavigationEnd(1, '/admin/dashboard?foo=bar', '/admin/dashboard?foo=bar'),
      );
      fixture.detectChanges();

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['assistants'] });
    });

    test('管理コンソール以外からの遷移でも再取得されること（遷移元を問わない）', () => {
      routerEvents$.next(new NavigationEnd(1, '/admin/library', '/admin/library'));
      fixture.detectChanges();
      mockQueryClient.invalidateQueries.mockClear();

      routerEvents$.next(new NavigationEnd(2, '/admin/chat/new', '/admin/chat/new'));
      fixture.detectChanges();

      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['assistants'] });
      expect(mockQueryClient.invalidateQueries).toHaveBeenCalledWith({
        queryKey: ['prompt-templates'],
      });
    });
  });
});
