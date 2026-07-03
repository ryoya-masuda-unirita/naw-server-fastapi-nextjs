import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NgClass } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DropdownService } from '@core/services/dropdown.service';
import { UiStore } from '@core/stores/ui.store';
import { ChatHeaderComponent } from './chat-header.component';

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

const mockDropdownService = {
  open: vi.fn(),
  closeAll: vi.fn(),
  notifyClosed: vi.fn(),
};

const mockUiStore = {
  toggleMobileSidebar: vi.fn(),
};

describe('ChatHeaderComponent', () => {
  let fixture: ComponentFixture<ChatHeaderComponent>;
  let component: ChatHeaderComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatHeaderComponent, NoopAnimationsModule],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
        { provide: DropdownService, useValue: mockDropdownService },
        { provide: UiStore, useValue: mockUiStore },
      ],
    })
      .overrideComponent(ChatHeaderComponent, {
        remove: { imports: [TranslateModule] },
        add: { imports: [FakeTranslatePipe] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatHeaderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('title', 'テストチャット');
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('title入力が正しく設定されること', () => {
      expect(component.title()).toBe('テストチャット');
    });

    test('初期状態でisMoreMenuOpenがfalseであること', () => {
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('isReadOnlyのデフォルト値がfalseであること', () => {
      expect(component.isReadOnly()).toBe(false);
    });
  });

  describe('DOM要素表示', () => {
    test('headerタグが表示されること', () => {
      const header = fixture.debugElement.query(By.css('header'));
      expect(header).toBeTruthy();
    });

    test('タイトルがDOMに表示されること', () => {
      const titleEl = fixture.debugElement.query(By.css('h1.chat-page-header-title'));
      expect(titleEl.nativeElement.textContent.trim()).toBe('テストチャット');
    });

    test('titleが変わるとDOMも更新されること', () => {
      fixture.componentRef.setInput('title', '新しいタイトル');
      fixture.detectChanges();
      const titleEl = fixture.debugElement.query(By.css('h1.chat-page-header-title'));
      expect(titleEl.nativeElement.textContent.trim()).toBe('新しいタイトル');
    });

    test('ハンバーガーボタンが存在すること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.SIDEBAR_TOGGLE"]'));
      expect(btn).toBeTruthy();
    });

    test('リネームボタンが存在すること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.RENAME"]'));
      expect(btn).toBeTruthy();
    });

    test('シェアボタンが存在すること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.SHARE"]'));
      expect(btn).toBeTruthy();
    });

    test('いいねボタンが存在すること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.LIKE"]'));
      expect(btn).toBeTruthy();
    });

    test('モアメニューボタンが存在すること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.MORE"]'));
      expect(btn).toBeTruthy();
    });

    test('isReadOnly=trueのときリネームボタンにmd:hidden!クラスが付与されること', () => {
      fixture.componentRef.setInput('isReadOnly', true);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.RENAME"]'));
      expect(btn.nativeElement.classList.contains('md:hidden!')).toBe(true);
    });

    test('isReadOnly=falseのときリネームボタンにmd:hidden!クラスが付与されないこと', () => {
      fixture.componentRef.setInput('isReadOnly', false);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.RENAME"]'));
      expect(btn.nativeElement.classList.contains('md:hidden!')).toBe(false);
    });

    test('isReadOnly=trueのときいいねボタンにmd:hidden!クラスが付与されること', () => {
      fixture.componentRef.setInput('isReadOnly', true);
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.LIKE"]'));
      expect(btn.nativeElement.classList.contains('md:hidden!')).toBe(true);
    });

    test('isMoreMenuOpen=falseの場合、ドロップダウンメニューが非表示であること', () => {
      component.isMoreMenuOpen.set(false);
      fixture.detectChanges();
      const menuEl = fixture.debugElement.query(By.css('.dropdown-menu'));
      expect(menuEl.nativeElement.hidden).toBe(true);
    });

    test('isMoreMenuOpen=trueの場合、ドロップダウンメニューが表示されること', () => {
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const menuEl = fixture.debugElement.query(By.css('.dropdown-menu'));
      expect(menuEl.nativeElement.hidden).toBe(false);
    });

    test('isMoreMenuOpen=trueのときis-openクラスが付与されること', () => {
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const menuEl = fixture.debugElement.query(By.css('.dropdown-menu'));
      expect(menuEl.nativeElement.classList.contains('is-open')).toBe(true);
    });

    test('ドロップダウンに4つのメニューアイテムが存在すること', () => {
      const items = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
      expect(items.length).toBe(4);
    });
  });

  describe('DOM要素イベント', () => {
    test('ハンバーガーボタンクリックでuiStore.toggleMobileSidebarが呼ばれること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.SIDEBAR_TOGGLE"]'));
      btn.nativeElement.click();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalledTimes(1);
    });

    test('toggleSidebar()でuiStore.toggleMobileSidebarが呼ばれること', () => {
      component.toggleSidebar();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalledTimes(1);
    });

    test('デスクトップ用リネームボタンクリックでrenameClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.renameClick, 'emit');
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.RENAME"]'));
      btn.nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('デスクトップ用シェアボタンクリックでshareClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.shareClick, 'emit');
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.SHARE"]'));
      btn.nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('デスクトップ用いいねボタンクリックでlikeClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.likeClick, 'emit');
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.LIKE"]'));
      btn.nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('モアメニューボタンクリックでisMoreMenuOpenがtrueになること', () => {
      const btn = fixture.debugElement.query(By.css('button[aria-label="HEADER.MORE"]'));
      btn.nativeElement.click();
      expect(component.isMoreMenuOpen()).toBe(true);
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

    test('メニューを開くときdropdownService.openが呼ばれること', () => {
      component.toggleMoreMenu();
      expect(mockDropdownService.open).toHaveBeenCalledTimes(1);
    });

    test('メニューを閉じるときdropdownService.notifyClosedが呼ばれること', () => {
      component.isMoreMenuOpen.set(true);
      component.toggleMoreMenu();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalledTimes(1);
    });

    test('closeMoreMenu()でisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.closeMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleRename()でrenameClickイベントが発火すること', () => {
      const emitSpy = vi.spyOn(component.renameClick, 'emit');
      component.handleRename();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('handleRename()でメニューが閉じられること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleRename();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleRename()でdropdownService.notifyClosedが呼ばれること', () => {
      component.handleRename();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalledTimes(1);
    });

    test('handleSettings()でsettingsClickイベントが発火すること', () => {
      const emitSpy = vi.spyOn(component.settingsClick, 'emit');
      component.handleSettings();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('handleSettings()でメニューが閉じられること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleSettings();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleShare()でshareClickイベントが発火すること', () => {
      const emitSpy = vi.spyOn(component.shareClick, 'emit');
      component.handleShare();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('handleShare()でメニューが閉じられること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleShare();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('handleLike()でlikeClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.likeClick, 'emit');
      component.handleLike();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('handleLike()でメニューが閉じられること', () => {
      component.isMoreMenuOpen.set(true);
      component.handleLike();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('ドロップダウンのリネームアイテムクリックでrenameClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.renameClick, 'emit');
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
      items[0].nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('ドロップダウンの設定アイテムクリックでsettingsClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.settingsClick, 'emit');
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
      items[1].nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('ドロップダウンのシェアアイテムクリックでshareClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.shareClick, 'emit');
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
      items[2].nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });

    test('ドロップダウンのいいねアイテムクリックでlikeClickが発火すること', () => {
      const emitSpy = vi.spyOn(component.likeClick, 'emit');
      component.isMoreMenuOpen.set(true);
      fixture.detectChanges();
      const items = fixture.debugElement.queryAll(By.css('button[role="menuitem"]'));
      items[3].nativeElement.click();
      expect(emitSpy).toHaveBeenCalledTimes(1);
    });
  });
});
