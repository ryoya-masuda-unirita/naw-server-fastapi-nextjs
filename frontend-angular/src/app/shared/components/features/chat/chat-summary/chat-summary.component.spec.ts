import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, Pipe, PipeTransform, input, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';

import { ChatSummaryComponent } from './chat-summary.component';
import { DropdownService } from '@core/services/dropdown.service';
import { LibraryService } from '@features/chat/services/library.service';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';

// --- Fake Translate Pipe ---
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --- Markdown Stub ---
@Component({ selector: 'markdown', standalone: true, template: '' })
class MarkdownStub {
  readonly data = input<string>('');
  readonly disableSanitizer = input<boolean>(false);
}

// --- Service Mocks ---
const mockDropdownService = {
  open: vi.fn(),
  closeAll: vi.fn(),
  notifyClosed: vi.fn(),
};

const mockDialogRef = { close: vi.fn() };
const mockDialog = {
  open: vi.fn().mockReturnValue(mockDialogRef),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockLibraryService = {
  updateLibraryMetadata: vi.fn().mockResolvedValue({ id: 'lib-1' }),
  isSavingToLibrary: signal(false),
  isLoadingLibrary: signal(false),
  libraryItems: signal([]),
};

const mockViewerService = {
  selectLibrary: vi.fn(),
  updateLibraryTitle: vi.fn(),
  markdownContent: signal('# テストコンテンツ'),
  isLoading: signal(false),
  viewers: signal<ViewerListItem[]>([]),
  isLoadingList: signal(false),
  listLoadError: signal(false),
  contentLoadError: signal(false),
  activeLibrary: signal<{ id: string; title: string } | null>(null),
  isLibraryStreaming: signal(false),
  streamingLibraryTitle: signal(''),
  streamingRoomId: signal<string | null>(null),
};

const mockRouter = { navigate: vi.fn() };

// --- TestBed Setup ---
const configureTestingModule = async () => {
  return await TestBed.configureTestingModule({
    imports: [ChatSummaryComponent, NoopAnimationsModule],
    providers: [
      { provide: DropdownService, useValue: mockDropdownService },
      { provide: MatDialog, useValue: mockDialog },
      { provide: TranslateService, useValue: mockTranslate },
      { provide: LibraryService, useValue: mockLibraryService },
      { provide: ViewerService, useValue: mockViewerService },
      { provide: Router, useValue: mockRouter },
    ],
  })
    .overrideComponent(ChatSummaryComponent, {
      set: { imports: [NgClass, MatIcon, FakeTranslatePipe, MarkdownStub] },
    })
    .compileComponents();
};

// --- Tests ---
describe('ChatSummaryComponent', () => {
  let component: ChatSummaryComponent;
  let fixture: ComponentFixture<ChatSummaryComponent>;

  beforeEach(async () => {
    mockViewerService.isLibraryStreaming.set(false);
    mockViewerService.streamingLibraryTitle.set('');
    mockViewerService.streamingRoomId.set(null);
    mockViewerService.activeLibrary.set(null);
    mockViewerService.viewers.set([{ id: '1', title: 'Doc' }]);
    mockViewerService.isLoadingList.set(false);
    mockViewerService.listLoadError.set(false);
    mockViewerService.contentLoadError.set(false);
    mockLibraryService.updateLibraryMetadata.mockResolvedValue({ id: 'lib-1' });
    await configureTestingModule();
    fixture = TestBed.createComponent(ChatSummaryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('isCollapsedの初期値はfalseであること', () => {
      expect(component.isCollapsed()).toBe(false);
    });

    test('isTitleMenuOpenの初期値はfalseであること', () => {
      expect(component.isTitleMenuOpen()).toBe(false);
    });

    test('isMoreMenuOpenの初期値はfalseであること', () => {
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('activeDocの初期値が空であること', () => {
      expect(component.activeDoc()).toEqual({ id: '', title: '' });
    });

    test('markdownDataゲッターがviewerServiceのmarkdownContentを返すこと', () => {
      expect(component.markdownData).toBe('# テストコンテンツ');
    });

    test('activeDocがviewerServiceのactiveLibraryを反映すること', () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: '会議メモ' });
      expect(component.activeDoc()).toEqual({ id: 'lib-1', title: '会議メモ' });
    });
  });

  describe('ライブラリ0件時の自動折りたたみ', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      mockViewerService.viewers.set([]);
      mockViewerService.isLoadingList.set(false);
      await configureTestingModule();
      fixture = TestBed.createComponent(ChatSummaryComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    test('ライブラリ0件の場合、初期表示で折りたたまれること', () => {
      expect(component.isCollapsed()).toBe(true);
    });

    test('ライブラリ0件の場合、collapseChangeがtrueで発火すること', async () => {
      TestBed.resetTestingModule();
      mockViewerService.viewers.set([]);
      await configureTestingModule();
      fixture = TestBed.createComponent(ChatSummaryComponent);
      component = fixture.componentInstance;
      const spy = vi.spyOn(component.collapseChange, 'emit');
      fixture.detectChanges();
      expect(spy).toHaveBeenCalledWith(true);
    });

    test('ストリーミング中はライブラリ0件でも折りたたまれないこと', async () => {
      TestBed.resetTestingModule();
      mockViewerService.viewers.set([]);
      mockViewerService.isLibraryStreaming.set(true);
      mockViewerService.streamingRoomId.set('room-abc');
      await configureTestingModule();
      fixture = TestBed.createComponent(ChatSummaryComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('chatId', 'room-abc');
      fixture.detectChanges();
      expect(component.isCollapsed()).toBe(false);
    });
  });

  describe('ストリーミング中の表示', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await configureTestingModule();
      fixture = TestBed.createComponent(ChatSummaryComponent);
      component = fixture.componentInstance;
      fixture.componentRef.setInput('chatId', 'room-abc');
      fixture.detectChanges();
    });

    test('同一ルームのストリーミング中はストリーミングタイトルがactiveDocに反映されること', () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: '既存ライブラリ' });
      mockViewerService.isLibraryStreaming.set(true);
      mockViewerService.streamingRoomId.set('room-abc');
      mockViewerService.streamingLibraryTitle.set('生成中タイトル');
      expect(component.activeDoc()).toEqual({ id: '', title: '生成中タイトル' });
    });

    test('タイトルデルタ到着前は選択中ライブラリのタイトルを表示し続けること', () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: '既存ライブラリ' });
      mockViewerService.isLibraryStreaming.set(true);
      mockViewerService.streamingRoomId.set('room-abc');
      mockViewerService.streamingLibraryTitle.set('');
      expect(component.activeDoc()).toEqual({ id: 'lib-1', title: '既存ライブラリ' });
    });

    test('別ルームのストリーミング中はactiveLibraryを表示すること', () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: '既存ライブラリ' });
      mockViewerService.isLibraryStreaming.set(true);
      mockViewerService.streamingRoomId.set('other-room');
      mockViewerService.streamingLibraryTitle.set('生成中タイトル');
      expect(component.activeDoc()).toEqual({ id: 'lib-1', title: '既存ライブラリ' });
    });
  });

  describe('DOM要素表示', () => {
    test('デフォルト状態でタイトルドロップダウントリガーボタンが表示されること', () => {
      const titleBtn = fixture.debugElement.query(By.css('.dropdown-trigger'));
      expect(titleBtn).toBeTruthy();
    });

    test('デフォルト状態でmoreMenuトリガーボタンが表示されること', () => {
      const moreBtn = fixture.debugElement.query(
        By.css('[aria-haspopup="menu"][aria-label="CHAT.VIEWER.MORE_OPTIONS"]'),
      );
      expect(moreBtn).toBeTruthy();
    });

    test('isDetailPage=falseの場合、コラプスボタンが表示されること', () => {
      const collapseBtn = fixture.debugElement.query(
        By.css('button[aria-label="CHAT.VIEWER.CLOSE"]'),
      );
      expect(collapseBtn).toBeTruthy();
    });

    test('isDetailPage=trueの場合、コラプスボタンが非表示になること', () => {
      fixture.componentRef.setInput('isDetailPage', true);
      fixture.detectChanges();
      const collapseBtn = fixture.debugElement.query(
        By.css('button[aria-label="CHAT.VIEWER.CLOSE"]'),
      );
      expect(collapseBtn).toBeFalsy();
    });

    test('isCollapsed=trueの場合、タイトルドロップダウントリガーが非表示になること', () => {
      component.isCollapsed.set(true);
      fixture.detectChanges();
      const titleBtn = fixture.debugElement.query(By.css('.dropdown-trigger'));
      expect(titleBtn).toBeFalsy();
    });

    test('isCollapsed=trueの場合、moreMenuトリガーボタンが非表示になること', () => {
      component.isCollapsed.set(true);
      fixture.detectChanges();
      const moreBtn = fixture.debugElement.query(By.css('[aria-label="CHAT.VIEWER.MORE_OPTIONS"]'));
      expect(moreBtn).toBeFalsy();
    });

    test('isCollapsed=falseの場合、markdownコンテンツエリアが表示されること', () => {
      fixture.componentRef.setInput('headerOptions', [{ id: '1', title: 'Doc A' }]);
      fixture.detectChanges();
      const markdownArea = fixture.debugElement.query(By.css('markdown'));
      expect(markdownArea).toBeTruthy();
    });

    test('isCollapsed=trueの場合、markdownコンテンツエリアが非表示になること', () => {
      component.isCollapsed.set(true);
      fixture.detectChanges();
      const markdownArea = fixture.debugElement.query(By.css('markdown'));
      expect(markdownArea).toBeFalsy();
    });

    test('コラプスボタンのaria-labelはisCollapsedに応じて変わること', () => {
      const collapseBtn = fixture.debugElement.query(
        By.css('button[aria-label="CHAT.VIEWER.CLOSE"]'),
      );
      expect(collapseBtn).toBeTruthy();

      component.isCollapsed.set(true);
      fixture.detectChanges();
      const openBtn = fixture.debugElement.query(By.css('button[aria-label="CHAT.VIEWER.OPEN"]'));
      expect(openBtn).toBeTruthy();
    });

    test('headerOptionsが設定された場合、タイトルメニューにdocタイトルが表示されること', () => {
      component.isTitleMenuOpen.set(true);
      fixture.componentRef.setInput('headerOptions', [
        { id: '1', title: 'ドキュメント A' },
        { id: '2', title: 'ドキュメント B' },
      ]);
      fixture.detectChanges();
      const titleMenu = fixture.debugElement.queryAll(By.css('.dropdown-menu'))[0];
      expect(titleMenu.nativeElement.textContent).toContain('ドキュメント A');
      expect(titleMenu.nativeElement.textContent).toContain('ドキュメント B');
    });

    test('activeDocと同じidのメニュー項目にbg-bg-brand-weakクラスが付くこと', () => {
      component.isTitleMenuOpen.set(true);
      mockViewerService.activeLibrary.set({ id: '1', title: '部門別 予実対比 2025 Q3' });
      fixture.componentRef.setInput('headerOptions', [
        { id: '1', title: '部門別 予実対比 2025 Q3' },
        { id: '2', title: '別ドキュメント' },
      ]);
      fixture.detectChanges();
      const menuItems = fixture.debugElement.queryAll(By.css('[role="menuitem"].bg-bg-brand-weak'));
      expect(menuItems.length).toBe(1);
    });
  });

  describe('DOM要素イベント', () => {
    test('toggleCollapseでisCollapsedがtrueに切り替わること', () => {
      component.toggleCollapse();
      expect(component.isCollapsed()).toBe(true);
    });

    test('toggleCollapseを2回呼ぶとisCollapsedがfalseに戻ること', () => {
      component.toggleCollapse();
      component.toggleCollapse();
      expect(component.isCollapsed()).toBe(false);
    });

    test('toggleCollapseでcollapseChangeが発火すること', () => {
      const spy = vi.spyOn(component.collapseChange, 'emit');
      component.toggleCollapse();
      expect(spy).toHaveBeenCalledWith(true);
    });

    test('toggleCollapseでdropdownService.notifyClosedが呼ばれること', () => {
      component.toggleCollapse();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('toggleCollapseでisTitleMenuOpenとisMoreMenuOpenがfalseになること', () => {
      component.isTitleMenuOpen.set(true);
      component.isMoreMenuOpen.set(true);
      component.toggleCollapse();
      expect(component.isTitleMenuOpen()).toBe(false);
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('toggleTitleMenu呼び出しでisTitleMenuOpenがtrueになること', () => {
      component.toggleTitleMenu();
      expect(component.isTitleMenuOpen()).toBe(true);
    });

    test('toggleTitleMenuでdropdownService.openが呼ばれること', () => {
      component.toggleTitleMenu();
      expect(mockDropdownService.open).toHaveBeenCalledTimes(1);
    });

    test('isTitleMenuOpen=trueの状態でtoggleTitleMenuを呼ぶとメニューが閉じること', () => {
      component.isTitleMenuOpen.set(true);
      component.toggleTitleMenu();
      expect(component.isTitleMenuOpen()).toBe(false);
    });

    test('toggleTitleMenu開封時にisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.toggleTitleMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('closeTitleMenuでisTitleMenuOpenがfalseになること', () => {
      component.isTitleMenuOpen.set(true);
      component.closeTitleMenu();
      expect(component.isTitleMenuOpen()).toBe(false);
    });

    test('selectDocumentでviewerService.selectLibraryに選択ドキュメントが渡されること', () => {
      component.selectDocument({ id: '2', title: '別ドキュメント' });
      expect(mockViewerService.selectLibrary).toHaveBeenCalledWith({
        id: '2',
        title: '別ドキュメント',
      });
    });

    test('selectDocumentでisTitleMenuOpenがfalseになること', () => {
      component.isTitleMenuOpen.set(true);
      component.selectDocument({ id: '2', title: '別ドキュメント' });
      expect(component.isTitleMenuOpen()).toBe(false);
    });

    test('selectDocumentでdropdownService.notifyClosedが呼ばれること', () => {
      component.selectDocument({ id: '2', title: '別ドキュメント' });
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('toggleMoreMenu呼び出しでisMoreMenuOpenがtrueになること', () => {
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(true);
    });

    test('toggleMoreMenuでdropdownService.openが呼ばれること', () => {
      component.toggleMoreMenu();
      expect(mockDropdownService.open).toHaveBeenCalledTimes(1);
    });

    test('isMoreMenuOpen=trueの状態でtoggleMoreMenuを呼ぶとメニューが閉じること', () => {
      component.isMoreMenuOpen.set(true);
      component.toggleMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('toggleMoreMenu開封時にisTitleMenuOpenがfalseになること', () => {
      component.isTitleMenuOpen.set(true);
      component.toggleMoreMenu();
      expect(component.isTitleMenuOpen()).toBe(false);
    });

    test('closeMoreMenuでisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.closeMoreMenu();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('openInNewTabでchatIdがある場合window.openが呼ばれること', () => {
      const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      fixture.componentRef.setInput('chatId', 'chat-123');
      fixture.detectChanges();
      component.openInNewTab();
      expect(windowSpy).toHaveBeenCalledWith('/chat/viewer/chat-123', '_blank');
    });

    test('openInNewTabでchatIdがnullの場合window.openが呼ばれないこと', () => {
      const windowSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      component.openInNewTab();
      expect(windowSpy).not.toHaveBeenCalled();
    });

    test('openInNewTabでopenNewTabが発火すること', () => {
      vi.spyOn(window, 'open').mockImplementation(() => null);
      const spy = vi.spyOn(component.openNewTab, 'emit');
      component.openInNewTab();
      expect(spy).toHaveBeenCalled();
    });

    test('openInNewTabでisMoreMenuOpenがfalseになること', () => {
      vi.spyOn(window, 'open').mockImplementation(() => null);
      component.isMoreMenuOpen.set(true);
      component.openInNewTab();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('onSaveToLibraryでdialog.openが呼ばれること', () => {
      component.onSaveToLibrary();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    test('onSaveToLibraryでisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.onSaveToLibrary();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('onSaveToLibraryでdropdownService.notifyClosedが呼ばれること', () => {
      component.onSaveToLibrary();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('canSaveLibraryはactiveLibrary未設定時falseであること', () => {
      expect(component.canSaveLibrary()).toBe(false);
    });

    test('canSaveLibraryはactiveLibrary設定時trueであること', () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: 'テスト' });
      fixture.detectChanges();
      expect(component.canSaveLibrary()).toBe(true);
    });

    test('runSaveでupdateLibraryMetadataが呼ばれること', async () => {
      mockViewerService.activeLibrary.set({ id: 'lib-1', title: 'タイトル' });
      fixture.detectChanges();
      component.onSaveToLibrary();
      const dialogData = mockDialog.open.mock.calls[0][1].data as {
        confirmAction: () => void;
      };
      dialogData.confirmAction();
      await Promise.resolve();
      expect(mockLibraryService.updateLibraryMetadata).toHaveBeenCalledWith('lib-1', {
        name: 'タイトル',
        tags: [],
        groups: [],
      });
      expect(mockViewerService.updateLibraryTitle).toHaveBeenCalledWith('lib-1', 'タイトル');
    });

    test('runSaveはlibraryId未設定時にupdateLibraryMetadataを呼ばないこと', () => {
      component.onSaveToLibrary();
      const dialogData = mockDialog.open.mock.calls[0][1].data as {
        confirmAction: () => void;
      };
      dialogData.confirmAction();
      expect(mockLibraryService.updateLibraryMetadata).not.toHaveBeenCalled();
    });

    test('onSaveToPdfでdropdownService.notifyClosedが呼ばれること', () => {
      component.onSaveToPdf();
      expect(mockDropdownService.notifyClosed).toHaveBeenCalled();
    });

    test('onSaveToPdfでsavePdfが発火すること', () => {
      const spy = vi.spyOn(component.savePdf, 'emit');
      component.onSaveToPdf();
      expect(spy).toHaveBeenCalled();
    });

    test('onSaveToPdfでisMoreMenuOpenがfalseになること', () => {
      component.isMoreMenuOpen.set(true);
      component.onSaveToPdf();
      expect(component.isMoreMenuOpen()).toBe(false);
    });

    test('onMarkdownContentClickでdropdown外のbuttonをクリックするとonSaveToPdfが呼ばれること', () => {
      const saveSpy = vi.spyOn(component, 'onSaveToPdf');
      const button = document.createElement('button');
      document.body.appendChild(button);
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: button, configurable: true });
      component.onMarkdownContentClick(event);
      expect(saveSpy).toHaveBeenCalled();
      document.body.removeChild(button);
    });

    test('onMarkdownContentClickでdropdown-menu内のbuttonクリック時はonSaveToPdfが呼ばれないこと', () => {
      const saveSpy = vi.spyOn(component, 'onSaveToPdf');
      const dropdown = document.createElement('div');
      dropdown.classList.add('dropdown-menu');
      const button = document.createElement('button');
      dropdown.appendChild(button);
      document.body.appendChild(dropdown);
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: button, configurable: true });
      component.onMarkdownContentClick(event);
      expect(saveSpy).not.toHaveBeenCalled();
      document.body.removeChild(dropdown);
    });

    test('onMarkdownContentClickでbutton以外のelement clickはonSaveToPdfを呼ばないこと', () => {
      const saveSpy = vi.spyOn(component, 'onSaveToPdf');
      const div = document.createElement('div');
      document.body.appendChild(div);
      const event = new MouseEvent('click', { bubbles: true });
      Object.defineProperty(event, 'target', { value: div, configurable: true });
      component.onMarkdownContentClick(event);
      expect(saveSpy).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });
  });
});
