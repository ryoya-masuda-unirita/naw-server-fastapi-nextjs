import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Input, Pipe, PipeTransform, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ANIMATION_MODULE_TYPE } from '@angular/platform-browser/animations';
import { TranslateService } from '@ngx-translate/core';
import { I18nService } from '@core/i18n/i18n.service';
import { DropdownService } from '@core/services/dropdown.service';
import { UiStore } from '@core/stores/ui.store';
import { PageHeaderComponent } from './page-header.component';
import type { TabItem } from '@app-types/tab.type';

// ── FakeTranslatePipe ──
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ── Child component stubs ──
@Component({ selector: 'app-tab', standalone: true, template: '' })
class AppTabStub {
  @Input() tabs: TabItem[] = [];
  @Input() activeTabId = '';
  @Input() containerClass = '';
  readonly tabChange = output<TabItem>();
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class AppMatIconStub {
  @Input() icon = '';
}

// ── Mock services ──
const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  currentLang: 'ja',
  defaultLang: 'ja',
  getCurrentLang: vi.fn(() => mockTranslate.currentLang),
  use: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockI18nService = {
  resolveLanguage: vi.fn(() => 'ja'),
  setLanguage: vi.fn().mockResolvedValue(undefined),
};

const mockDropdownService = {
  open: vi.fn(),
  closeAll: vi.fn(),
  notifyClosed: vi.fn(),
};

const mockUiStore = {
  toggleMobileSidebar: vi.fn(),
};

describe('PageHeaderComponent', () => {
  let fixture: ComponentFixture<PageHeaderComponent>;
  let component: PageHeaderComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockTranslate.currentLang = 'ja';

    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: I18nService, useValue: mockI18nService },
        { provide: DropdownService, useValue: mockDropdownService },
        { provide: UiStore, useValue: mockUiStore },
      ],
    })
      .overrideComponent(PageHeaderComponent, {
        set: {
          imports: [FakeTranslatePipe, MatIconModule, AppTabStub, AppMatIconStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(PageHeaderComponent);
    component = fixture.componentInstance;

    // Provide required input
    fixture.componentRef.setInput('title', 'テストタイトル');
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ────────────────────────────────────────────────────────────
  describe('初期値・ゲッター', () => {
    test('title入力が正しく設定されること', () => {
      expect(component.title()).toBe('テストタイトル');
    });

    test('showBackButtonのデフォルト値がtrueであること', () => {
      expect(component.showBackButton()).toBe(true);
    });

    test('showSidebarToggleのデフォルト値がtrueであること', () => {
      expect(component.showSidebarToggle()).toBe(true);
    });

    test('showActionsのデフォルト値がtrueであること', () => {
      expect(component.showActions()).toBe(true);
    });

    test('showShareButtonのデフォルト値がtrueであること', () => {
      expect(component.showShareButton()).toBe(true);
    });

    test('showLikeButtonのデフォルト値がtrueであること', () => {
      expect(component.showLikeButton()).toBe(true);
    });

    test('showLanguageToggleのデフォルト値がtrueであること', () => {
      expect(component.showLanguageToggle()).toBe(true);
    });

    test('stickyのデフォルト値がtrueであること', () => {
      expect(component.sticky()).toBe(true);
    });

    test('isMoreMenuOpenの初期値がfalseであること', () => {
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('settingsIconのデフォルト値が"tune"であること', () => {
      expect(component.settingsIcon()).toBe('tune');
    });

    test('titleKeyが未設定の場合、getTitle()はtitleを返すこと', () => {
      expect(component.getTitle()).toBe('テストタイトル');
    });

    test('titleKeyが設定されている場合、getTitle()はtranslate.instantを呼ぶこと', () => {
      fixture.componentRef.setInput('titleKey', 'SOME.KEY');
      fixture.detectChanges();
      const result = component.getTitle();
      expect(mockTranslate.instant).toHaveBeenCalledWith('SOME.KEY');
      expect(result).toBe('SOME.KEY');
    });

    test('currentLangが"en"の場合、getCurrentLanguageDisplay()は"EN"を返すこと', () => {
      mockTranslate.currentLang = 'en';
      expect(component.getCurrentLanguageDisplay()).toBe('EN');
    });

    test('currentLangが"ja"の場合、getCurrentLanguageDisplay()は"日本語"を返すこと', () => {
      mockTranslate.currentLang = 'ja';
      expect(component.getCurrentLanguageDisplay()).toBe('日本語');
    });
  });

  // ────────────────────────────────────────────────────────────
  describe('DOM要素表示', () => {
    test('モバイル用headerタグが表示されること', () => {
      const headers = fixture.debugElement.queryAll(By.css('header'));
      expect(headers.length).toBeGreaterThanOrEqual(1);
    });

    test('タイトルがモバイルh2に表示されること', () => {
      const h2 = fixture.debugElement.query(By.css('header h2'));
      expect(h2).toBeTruthy();
      expect(h2.nativeElement.textContent).toContain('テストタイトル');
    });

    test('タイトル領域がflex-1 min-w-0で省略可能なレイアウトであること', () => {
      const titleArea = fixture.debugElement.query(By.css('header h2')).parent?.parent;
      expect(titleArea).toBeTruthy();
      expect(titleArea!.nativeElement.classList.contains('flex-1')).toBe(true);
      expect(titleArea!.nativeElement.classList.contains('min-w-0')).toBe(true);
    });

    test('デスクトップh2にタイトルが表示されること', () => {
      const h2 = fixture.debugElement.query(By.css('header h2'));
      expect(h2).toBeTruthy();
      expect(h2.nativeElement.textContent).toContain('テストタイトル');
    });

    test('showSidebarToggle=trueの場合サイドバートグルボタンが表示されること', () => {
      // The sidebar toggle button contains the icon-side-navigation image
      const btn = fixture.debugElement.query(By.css('img[alt="HEADER.SIDEBAR_TOGGLE"]'));
      expect(btn).toBeTruthy();
    });

    test('showSidebarToggle=falseの場合サイドバートグルボタンが非表示になること', () => {
      fixture.componentRef.setInput('showSidebarToggle', false);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('img[alt="HEADER.SIDEBAR_TOGGLE"]'));
      expect(btn).toBeNull();
    });

    test('showBackButtonInMobile=trueの場合モバイル戻るボタンが表示されること', () => {
      fixture.componentRef.setInput('showBackButtonInMobile', true);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('button[title="HEADER.BACK"] mat-icon'));
      expect(btn).toBeTruthy();
    });

    test('showActions=falseの場合アクションボタンが非表示になること', () => {
      fixture.componentRef.setInput('showActions', false);
      fixture.detectChanges();
      const shareBtn = fixture.debugElement.query(By.css('button[title="HEADER.SHARE"]'));
      expect(shareBtn).toBeNull();
    });

    test('showShareButton=trueかつshowActions=trueの場合シェアボタンが表示されること', () => {
      const shareBtns = fixture.debugElement.queryAll(By.css('button[title="HEADER.SHARE"]'));
      expect(shareBtns.length).toBeGreaterThan(0);
    });

    test('showShareButton=falseの場合シェアボタンが表示されないこと', () => {
      fixture.componentRef.setInput('showShareButton', false);
      fixture.detectChanges();
      const shareBtn = fixture.debugElement.query(By.css('button[title="HEADER.SHARE"]'));
      expect(shareBtn).toBeNull();
    });

    test('showLikeButton=trueの場合いいねボタンが表示されること', () => {
      const likeBtns = fixture.debugElement.queryAll(By.css('button[title="HEADER.LIKE"]'));
      expect(likeBtns.length).toBeGreaterThan(0);
    });

    test('showLikeButton=falseの場合いいねボタンが非表示になること', () => {
      fixture.componentRef.setInput('showLikeButton', false);
      fixture.detectChanges();
      const likeBtn = fixture.debugElement.query(By.css('button[title="HEADER.LIKE"]'));
      expect(likeBtn).toBeNull();
    });

    test('settingsIcon="more_vert"の場合モアメニューボタンが表示されること', () => {
      fixture.componentRef.setInput('settingsIcon', 'more_vert');
      fixture.detectChanges();
      const moreBtn = fixture.debugElement.query(By.css('button[aria-haspopup="true"]'));
      expect(moreBtn).toBeTruthy();
    });

    test('settingsIcon="tune"の場合通常のsettingsボタンが表示されること', () => {
      // settingsIcon defaults to 'tune'
      const settingsBtn = fixture.debugElement.query(By.css('button[title="HEADER.SETTINGS"]'));
      expect(settingsBtn).toBeTruthy();
    });

    test('isMoreMenuOpen=trueの場合ドロップダウンメニューが表示されること', () => {
      fixture.componentRef.setInput('settingsIcon', 'more_vert');
      fixture.detectChanges();
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const menu = fixture.debugElement.query(By.css('[role="menu"]'));
      expect(menu).toBeTruthy();
      expect(menu.attributes['hidden']).toBeUndefined();
    });

    test('isMoreMenuOpen=falseの場合ドロップダウンメニューがhiddenであること', () => {
      fixture.componentRef.setInput('settingsIcon', 'more_vert');
      fixture.detectChanges();
      component.isMoreMenuOpen.set(false);
      fixture.detectChanges();
      const menu = fixture.debugElement.query(By.css('[role="menu"]'));
      // hidden attribute exists when menu is closed
      expect(menu).toBeTruthy();
      expect(menu.nativeElement.hidden).toBe(true);
    });

    test('tabs入力がある場合app-tabコンポーネントが表示されること', () => {
      const tabs: TabItem[] = [
        { id: 'tab1', label: 'タブ1' },
        { id: 'tab2', label: 'タブ2' },
      ];
      fixture.componentRef.setInput('tabs', tabs);
      fixture.detectChanges();
      const tabComponents = fixture.debugElement.queryAll(By.css('app-tab'));
      expect(tabComponents.length).toBeGreaterThan(0);
    });

    test('tabsが空の場合app-tabコンポーネントが表示されないこと', () => {
      fixture.componentRef.setInput('tabs', []);
      fixture.detectChanges();
      const tabComponent = fixture.debugElement.query(By.css('app-tab'));
      expect(tabComponent).toBeNull();
    });

    test('showLanguageToggle=trueかつshowLanguageToggleInDesktop=trueの場合言語切替ボタンが表示されること', () => {
      fixture.componentRef.setInput('showLanguageToggleInMobile', true);
      fixture.detectChanges();
      const langBtns = fixture.debugElement.queryAll(
        By.css('button[title="HEADER.LANGUAGE_TOGGLE"]'),
      );
      expect(langBtns.length).toBeGreaterThan(0);
    });

    test('showLanguageToggle=falseの場合言語切替ボタンが表示されないこと', () => {
      fixture.componentRef.setInput('showLanguageToggle', false);
      fixture.detectChanges();
      const langBtn = fixture.debugElement.query(By.css('button[title="HEADER.LANGUAGE_TOGGLE"]'));
      expect(langBtn).toBeNull();
    });

    test('sticky=trueの場合headerにstickyクラスが付与されること', () => {
      const header = fixture.debugElement.query(By.css('header'));
      expect(header.classes['sticky']).toBe(true);
    });

    test('sticky=falseの場合headerにstickyクラスが付与されないこと', () => {
      fixture.componentRef.setInput('sticky', false);
      fixture.detectChanges();
      const header = fixture.debugElement.query(By.css('header'));
      expect(header.classes['sticky']).toBeFalsy();
    });
  });

  // ────────────────────────────────────────────────────────────
  describe('DOM要素イベント', () => {
    test('toggleSidebar()でuiStore.toggleMobileSidebarが呼ばれること', () => {
      component.toggleSidebar();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalledTimes(1);
    });

    test('サイドバートグルボタンクリックでtoggleSidebarが動作すること', () => {
      const btn = fixture.debugElement.query(By.css('button[title="HEADER.SIDEBAR_TOGGLE"]'));
      expect(btn).toBeTruthy();
      btn.nativeElement.click();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalledTimes(1);
    });

    test('goBack()でlocation.back()が呼ばれること', () => {
      // Inject the real Location via component's private field or spy on component
      const locationSpy = vi.spyOn(component['location'], 'back');
      component.goBack();
      expect(locationSpy).toHaveBeenCalledTimes(1);
    });

    test('shareClick.emit()がシェアボタンクリックで発火すること', () => {
      const emitted: void[] = [];
      component.shareClick.subscribe(() => emitted.push(undefined));

      const shareBtns = fixture.debugElement.queryAll(By.css('button[title="HEADER.SHARE"]'));
      expect(shareBtns.length).toBeGreaterThan(0);
      shareBtns[0].nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('likeClick.emit()がいいねボタンクリックで発火すること', () => {
      const emitted: void[] = [];
      component.likeClick.subscribe(() => emitted.push(undefined));

      const likeBtns = fixture.debugElement.queryAll(By.css('button[title="HEADER.LIKE"]'));
      expect(likeBtns.length).toBeGreaterThan(0);
      likeBtns[0].nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('settingsClick.emit()が設定ボタンクリックで発火すること (tune icon)', () => {
      const emitted: void[] = [];
      component.settingsClick.subscribe(() => emitted.push(undefined));

      const settingsBtns = fixture.debugElement.queryAll(By.css('button[title="HEADER.SETTINGS"]'));
      expect(settingsBtns.length).toBeGreaterThan(0);
      settingsBtns[0].nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('toggleMoreMenu()でisMoreMenuOpenがtrueになること', () => {
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(true);
    });

    test('toggleMoreMenu()を2回呼ぶとisMoreMenuOpenがfalseに戻ること', () => {
      component.toggleMoreMenu();
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('toggleMoreMenu()でdropdownService.openが呼ばれること', () => {
      component.toggleMoreMenu();
      expect(mockDropdownService.open).toHaveBeenCalledTimes(1);
    });

    test('isMoreMenuOpen=trueのときtoggleMoreMenu()でdropdownService.notifyClosedが呼ばれること', () => {
      component.isMoreMenuOpen.set(true);
      component.toggleMoreMenu();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalledTimes(1);
    });

    test('handleRename()でrenameClickイベントが発火すること', () => {
      const emitted: void[] = [];
      component.renameClick.subscribe(() => emitted.push(undefined));

      component.handleRename();

      expect(emitted.length).toBe(1);
    });

    test('handleRename()でisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleRename();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleRename()でdropdownService.notifyClosedが呼ばれること', () => {
      component.handleRename();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalledTimes(1);
    });

    test('handleMoreSettings()でsettingsClickイベントが発火すること', () => {
      const emitted: void[] = [];
      component.settingsClick.subscribe(() => emitted.push(undefined));

      component.handleMoreSettings();

      expect(emitted.length).toBe(1);
    });

    test('handleMoreSettings()でisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleMoreSettings();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleMoreShare()でshareClickイベントが発火すること', () => {
      const emitted: void[] = [];
      component.shareClick.subscribe(() => emitted.push(undefined));

      component.handleMoreShare();

      expect(emitted.length).toBe(1);
    });

    test('handleMoreShare()でisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleMoreShare();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleMoreLike()でlikeClickイベントが発火すること', () => {
      const emitted: void[] = [];
      component.likeClick.subscribe(() => emitted.push(undefined));

      component.handleMoreLike();

      expect(emitted.length).toBe(1);
    });

    test('handleMoreLike()でisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleMoreLike();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('toggleLanguage()でja→enに切り替えられること', () => {
      mockTranslate.currentLang = 'ja';
      component.toggleLanguage();
      expect(mockI18nService.setLanguage).toHaveBeenCalledWith('en');
    });

    test('toggleLanguage()でen→jaに切り替えられること', () => {
      mockTranslate.currentLang = 'en';
      component.toggleLanguage();
      expect(mockI18nService.setLanguage).toHaveBeenCalledWith('ja');
    });

    test('言語切替ボタンクリックでtoggleLanguageが動作すること', () => {
      fixture.componentRef.setInput('showLanguageToggleInMobile', true);
      fixture.detectChanges();
      const langBtns = fixture.debugElement.queryAll(
        By.css('button[title="HEADER.LANGUAGE_TOGGLE"]'),
      );
      expect(langBtns.length).toBeGreaterThan(0);
      langBtns[0].nativeElement.click();
      expect(mockI18nService.setLanguage).toHaveBeenCalled();
    });

    test('backClick.emit()がshowBackButtonInMobile=trueの戻るボタンクリックで発火すること', () => {
      fixture.componentRef.setInput('showBackButtonInMobile', true);
      fixture.detectChanges();

      const emitted: void[] = [];
      component.backClick.subscribe(() => emitted.push(undefined));

      const mobileBackBtn = fixture.debugElement.query(By.css('button[title="HEADER.BACK"]'));
      expect(mobileBackBtn).toBeTruthy();
      mobileBackBtn.nativeElement.click();

      expect(emitted.length).toBe(1);
    });

    test('tabChangeイベントがapp-tabから伝搬されること', () => {
      const tabs: TabItem[] = [
        { id: 'tab1', label: 'タブ1' },
        { id: 'tab2', label: 'タブ2' },
      ];
      fixture.componentRef.setInput('tabs', tabs);
      fixture.detectChanges();

      const emitted: TabItem[] = [];
      component.tabChange.subscribe((tab) => emitted.push(tab));

      // Emit from the stub component
      const tabEl = fixture.debugElement.query(By.css('app-tab'));
      (tabEl.componentInstance as AppTabStub).tabChange.emit({ id: 'tab2', label: 'タブ2' });

      expect(emitted.length).toBe(1);
      expect(emitted[0].id).toBe('tab2');
    });
  });
});
