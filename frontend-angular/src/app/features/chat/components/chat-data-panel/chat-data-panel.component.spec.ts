import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, Pipe, PipeTransform, input, output, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DropdownService } from '@core/services/dropdown.service';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';
import { ChatSummaryComponent } from '@shared/components/features/chat/chat-summary/chat-summary.component';
import {
  ChatDataPanelComponent,
  VIEWER_WIDTH_COLLAPSED,
  VIEWER_WIDTH_EXPANDED,
  VIEWER_WIDTH_MAX,
  VIEWER_WIDTH_MIN,
} from './chat-data-panel.component';

// --- Stubs & fakes ---

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// Template binding: [chatId]="roomId()" [headerOptions]="headerOptions()"
@Component({ selector: 'app-chat-summary', standalone: true, template: '' })
class ChatSummaryStub {
  readonly chatId = input<string | null>(null);
  readonly isDetailPage = input<boolean>(false);
  readonly isReadOnly = input<boolean>(false);
  readonly headerOptions = input<ViewerListItem[]>([]);
  readonly collapseChange = output<boolean>();
}

// --- Mock data ---

const MOCK_VIEWERS: ViewerListItem[] = [
  { id: '1', title: 'Doc A' },
  { id: '2', title: 'Doc B' },
];

// --- Mock services ---

const mockViewers = signal<ViewerListItem[]>([]);
const mockIsLibraryStreaming = signal<boolean>(false);

const mockViewerService = {
  loadList: vi.fn().mockResolvedValue(undefined),
  viewers: mockViewers,
  isLibraryStreaming: mockIsLibraryStreaming,
};

const mockDropdownService = {
  open: vi.fn(),
  closeAll: vi.fn(),
  notifyClosed: vi.fn(),
};

const mockTranslateService = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

// --- Suite ---

describe('ChatDataPanelComponent', () => {
  let component: ChatDataPanelComponent;
  let fixture: ComponentFixture<ChatDataPanelComponent>;

  beforeEach(async () => {
    mockViewers.set([]);
    mockIsLibraryStreaming.set(false);
    mockViewerService.loadList.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ChatDataPanelComponent, NoopAnimationsModule],
      providers: [
        { provide: ViewerService, useValue: mockViewerService },
        { provide: DropdownService, useValue: mockDropdownService },
        { provide: TranslateService, useValue: mockTranslateService },
      ],
    })
      .overrideComponent(ChatDataPanelComponent, {
        set: { imports: [FakeTranslatePipe, ChatSummaryStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatDataPanelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ──────────────────────────────────────────────────────────────────────────
  // 初期値・ゲッター
  // ──────────────────────────────────────────────────────────────────────────
  describe('初期値・ゲッター', () => {
    test('初期状態でisCollapsedがfalseであること', () => {
      expect(component.isCollapsed()).toBe(false);
    });

    test('初期状態でpanelWidthがVIEWER_WIDTH_EXPANDEDであること', () => {
      expect(component.panelWidth()).toBe(VIEWER_WIDTH_EXPANDED);
    });

    test('初期状態でheaderOptionsが空配列であること', () => {
      expect(component.headerOptions()).toEqual([]);
    });

    test('VIEWER_WIDTH_COLLAPSEDが公開定数として参照できること', () => {
      expect(component.VIEWER_WIDTH_COLLAPSED).toBe(VIEWER_WIDTH_COLLAPSED);
    });

    test('roomIdのデフォルト値がnullであること', () => {
      expect(component.roomId()).toBeNull();
    });

    test('定数VIEWER_WIDTH_EXPANDEDが400であること', () => {
      expect(VIEWER_WIDTH_EXPANDED).toBe(400);
    });

    test('定数VIEWER_WIDTH_COLLAPSEDが52であること', () => {
      expect(VIEWER_WIDTH_COLLAPSED).toBe(52);
    });

    test('定数VIEWER_WIDTH_MINが280であること', () => {
      expect(VIEWER_WIDTH_MIN).toBe(280);
    });

    test('定数VIEWER_WIDTH_MAXが1018であること', () => {
      expect(VIEWER_WIDTH_MAX).toBe(1018);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DOM要素表示
  // ──────────────────────────────────────────────────────────────────────────
  describe('DOM要素表示', () => {
    test('折りたたまれていない場合にリサイズハンドルが表示されること', () => {
      component.isCollapsed.set(false);
      fixture.detectChanges();
      const handle = fixture.debugElement.query(By.css('[role="separator"]'));
      expect(handle).toBeTruthy();
    });

    test('折りたたまれている場合にリサイズハンドルが非表示になること', () => {
      component.isCollapsed.set(true);
      fixture.detectChanges();
      const handle = fixture.debugElement.query(By.css('[role="separator"]'));
      expect(handle).toBeNull();
    });

    test('app-chat-summaryコンポーネントが常に表示されること', () => {
      const summary = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(summary).toBeTruthy();
    });

    test('roomIdがapp-chat-summaryのchatIdとして渡されること', () => {
      fixture.componentRef.setInput('roomId', 'room-123');
      fixture.detectChanges();
      const stub = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(stub.componentInstance.chatId()).toBe('room-123');
    });

    test('roomIdがnullの場合chatIdがnullとして渡されること', () => {
      fixture.componentRef.setInput('roomId', null);
      fixture.detectChanges();
      const stub = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(stub.componentInstance.chatId()).toBeNull();
    });

    test('headerOptionsがapp-chat-summaryに渡されること', () => {
      mockViewers.set(MOCK_VIEWERS);
      fixture.detectChanges();
      const stub = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(stub.componentInstance.headerOptions()).toEqual(MOCK_VIEWERS);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DOM要素イベント
  // ──────────────────────────────────────────────────────────────────────────
  describe('DOM要素イベント', () => {
    test('onCollapseChange(true)でisCollapsedがtrueになること', () => {
      component.onCollapseChange(true);
      expect(component.isCollapsed()).toBe(true);
    });

    test('onCollapseChange(false)でisCollapsedがfalseになること', () => {
      component.isCollapsed.set(true);
      component.onCollapseChange(false);
      expect(component.isCollapsed()).toBe(false);
    });

    test('onCollapseChange()でcollapseChangeアウトプットが送出されること', () => {
      const emitted: boolean[] = [];
      component.collapseChange.subscribe((v) => emitted.push(v));
      component.onCollapseChange(true);
      expect(emitted).toEqual([true]);
    });

    test('複数回のonCollapseChange()でイベントが順番通りに送出されること', () => {
      const emitted: boolean[] = [];
      component.collapseChange.subscribe((v) => emitted.push(v));
      component.onCollapseChange(true);
      component.onCollapseChange(false);
      component.onCollapseChange(true);
      expect(emitted).toEqual([true, false, true]);
    });

    test('chat-summaryのcollapseChangeイベントでonCollapseChangeが呼ばれること', () => {
      const spy = vi.spyOn(component, 'onCollapseChange');
      const stub = fixture.debugElement.query(By.directive(ChatSummaryStub));
      stub.componentInstance.collapseChange.emit(true);
      expect(spy).toHaveBeenCalledWith(true);
    });

    test('startResize()でpreventDefaultが呼ばれること', () => {
      const event = new MouseEvent('mousedown', { clientX: 500, bubbles: true });
      const spy = vi.spyOn(event, 'preventDefault');
      component.startResize(event);
      expect(spy).toHaveBeenCalled();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('startResize()でbodyのcursorがcol-resizeになること', () => {
      component.startResize(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('mouseup後にbodyのcursorがリセットされること', () => {
      component.startResize(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });

    test('startResize時にCSS transitionが無効化されること', () => {
      component.startResize(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
      expect(component['el'].nativeElement.classList.contains('!transition-none')).toBe(true);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('startResize完了時にCSS transitionクラスが削除されること', () => {
      component.startResize(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(component['el'].nativeElement.classList.contains('!transition-none')).toBe(false);
    });

    test('mousemoveでpanelWidthが更新されること', () => {
      vi.spyOn(component['el'].nativeElement, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        top: 0,
        left: 0,
        bottom: 0,
        right: 400,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      // startX=600, startWidth=400 → dx = 600 - 500 = 100 → newWidth = 400 + 100 = 500
      component.startResize(new MouseEvent('mousedown', { clientX: 600, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, bubbles: true }));
      fixture.detectChanges();

      expect(component.panelWidth()).toBe(500);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('panelWidthがVIEWER_WIDTH_MINより小さくならないこと', () => {
      vi.spyOn(component['el'].nativeElement, 'getBoundingClientRect').mockReturnValue({
        width: 400,
        top: 0,
        left: 0,
        bottom: 0,
        right: 400,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      // drag far right → dx becomes negative → clamps to MIN
      component.startResize(new MouseEvent('mousedown', { clientX: 600, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 1200, bubbles: true }));
      fixture.detectChanges();

      expect(component.panelWidth()).toBe(VIEWER_WIDTH_MIN);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('panelWidthがVIEWER_WIDTH_MAXを超えないこと', () => {
      vi.spyOn(component['el'].nativeElement, 'getBoundingClientRect').mockReturnValue({
        width: 800,
        top: 0,
        left: 0,
        bottom: 0,
        right: 800,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

      // drag far left → huge dx → clamps to MAX
      component.startResize(new MouseEvent('mousedown', { clientX: 1000, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, bubbles: true }));
      fixture.detectChanges();

      expect(component.panelWidth()).toBe(VIEWER_WIDTH_MAX);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    test('mouseup後にイベントリスナーが削除されること', () => {
      const spy = vi.spyOn(document, 'removeEventListener');
      component.startResize(new MouseEvent('mousedown', { clientX: 500, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(spy).toHaveBeenCalledWith('mousemove', expect.any(Function));
      expect(spy).toHaveBeenCalledWith('mouseup', expect.any(Function));
    });

    test('リサイズハンドルのmousedownイベントでstartResizeが呼ばれること', () => {
      component.isCollapsed.set(false);
      fixture.detectChanges();
      const spy = vi.spyOn(component, 'startResize');
      const handle = fixture.debugElement.query(By.css('[role="separator"]'));
      handle.nativeElement.dispatchEvent(
        new MouseEvent('mousedown', { clientX: 500, bubbles: true }),
      );
      expect(spy).toHaveBeenCalled();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // エフェクト
  // ──────────────────────────────────────────────────────────────────────────
  describe('エフェクト', () => {
    test('isCollapsed=falseの場合にpanelWidth分のwidthがスタイルに設定されること', () => {
      component.isCollapsed.set(false);
      component.panelWidth.set(500);
      fixture.detectChanges();
      expect(fixture.nativeElement.style.width).toBe('500px');
    });

    test('isCollapsed=trueの場合にVIEWER_WIDTH_COLLAPSEDのwidthがスタイルに設定されること', () => {
      component.isCollapsed.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.style.width).toBe(`${VIEWER_WIDTH_COLLAPSED}px`);
    });

    test('isCollapsedの変更に応じてwidthが切り替わること', () => {
      expect(fixture.nativeElement.style.width).toBe(`${VIEWER_WIDTH_EXPANDED}px`);

      component.isCollapsed.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.style.width).toBe(`${VIEWER_WIDTH_COLLAPSED}px`);

      component.isCollapsed.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.style.width).toBe(`${component.panelWidth()}px`);
    });

    test('roomIdが設定された場合にviewerService.loadListが呼ばれること', async () => {
      fixture.componentRef.setInput('roomId', 'room-abc');
      fixture.detectChanges();
      await Promise.resolve();
      expect(mockViewerService.loadList).toHaveBeenCalledWith('room-abc');
    });

    test('roomIdがnullの場合にloadListが呼ばれないこと', async () => {
      mockViewerService.loadList.mockClear();
      fixture.componentRef.setInput('roomId', null);
      fixture.detectChanges();
      await Promise.resolve();
      expect(mockViewerService.loadList).not.toHaveBeenCalled();
    });

    test('loadList内のシグナル読み取りがeffectに追跡されず、ストリーム状態の変化でloadListが再実行されないこと', async () => {
      // 実サービス同様、loadList の同期部分でストリーミング系シグナルを読む
      mockViewerService.loadList.mockImplementation(async () => {
        mockIsLibraryStreaming();
      });
      fixture.componentRef.setInput('roomId', 'room-abc');
      fixture.detectChanges();
      await Promise.resolve();
      expect(mockViewerService.loadList).toHaveBeenCalledTimes(1);

      // ストリーム終了相当のシグナル変化が effect の再実行（= 一覧の重複取得）を引き起こさない
      mockIsLibraryStreaming.set(true);
      fixture.detectChanges();
      mockIsLibraryStreaming.set(false);
      fixture.detectChanges();
      await Promise.resolve();
      expect(mockViewerService.loadList).toHaveBeenCalledTimes(1);
    });

    test('loadList完了後にheaderOptionsがviewers()の値で更新されること', async () => {
      mockViewerService.loadList.mockImplementation(async () => {
        mockViewers.set(MOCK_VIEWERS);
      });
      fixture.componentRef.setInput('roomId', 'room-xyz');
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 0));
      expect(component.headerOptions()).toEqual(MOCK_VIEWERS);
    });
  });
});
