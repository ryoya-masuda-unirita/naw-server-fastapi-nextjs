import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatViewerComponent } from './chat-viewer.component';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';

@Component({
  selector: 'app-chat-summary',
  standalone: true,
  template: '',
})
class ChatSummaryStub {
  readonly chatId = input<string | null>(null);
  readonly isDetailPage = input<boolean>(false);
  readonly headerOptions = input<ViewerListItem[]>([]);
}

const mockViewers = signal<ViewerListItem[]>([]);

const mockViewerService = {
  viewers: mockViewers,
  loadList: vi.fn().mockResolvedValue(undefined),
  selectLibrary: vi.fn(),
  showLibrary: vi.fn().mockResolvedValue(undefined),
};

const mockActivatedRoute = {
  snapshot: {
    paramMap: {
      get: vi.fn().mockReturnValue(null),
    },
    queryParamMap: {
      get: vi.fn().mockReturnValue(null),
    },
  },
};

describe('ChatViewerComponent', () => {
  let fixture: ComponentFixture<ChatViewerComponent>;
  let component: ChatViewerComponent;

  beforeEach(async () => {
    mockViewers.set([]);
    mockActivatedRoute.snapshot.paramMap.get.mockReturnValue(null);
    mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue(null);
    mockViewerService.loadList.mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [ChatViewerComponent],
      providers: [
        { provide: ViewerService, useValue: mockViewerService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    })
      .overrideComponent(ChatViewerComponent, {
        remove: { imports: [] },
        add: { imports: [ChatSummaryStub] },
      })
      .overrideComponent(ChatViewerComponent, {
        set: { imports: [ChatSummaryStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatViewerComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('chatIdの初期値がnullであること', () => {
      expect(component.chatId()).toBeNull();
    });

    test('headerOptionsの初期値が空配列であること', () => {
      expect(component.headerOptions()).toEqual([]);
    });
  });

  describe('ngOnInit', () => {
    test('routeからchatIdパラメータを取得してsignalにセットすること', async () => {
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-123');
      await component.ngOnInit();

      expect(component.chatId()).toBe('chat-123');
    });

    test('chatIdがnullの場合、空文字でloadListを呼び出すこと', async () => {
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue(null);
      await component.ngOnInit();

      expect(mockViewerService.loadList).toHaveBeenCalledWith('', {});
    });

    test('chatIdが存在する場合、そのIDでloadListを呼び出すこと', async () => {
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-456');
      await component.ngOnInit();

      expect(mockViewerService.loadList).toHaveBeenCalledWith('chat-456', {});
    });

    test('headerOptions が viewerService.viewers() をリアクティブに反映すること', async () => {
      const mockList: ViewerListItem[] = [
        { id: '1', title: 'ドキュメント1' },
        { id: '2', title: 'ドキュメント2' },
      ];
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-789');
      await component.ngOnInit();

      // ngOnInit 後に viewers が変化しても headerOptions に自動反映される
      mockViewers.set(mockList);
      expect(component.headerOptions()).toEqual(mockList);

      // 追加後の変化も反映される
      const extended = [...mockList, { id: '3', title: 'ドキュメント3' }];
      mockViewers.set(extended);
      expect(component.headerOptions()).toEqual(extended);
    });

    test('libraryIdクエリがある場合、一覧取得後にselectLibraryを呼び出すこと', async () => {
      const mockList: ViewerListItem[] = [
        { id: 'lib-1', title: 'ドキュメント1' },
        { id: 'lib-2', title: 'ドキュメント2' },
      ];
      mockViewers.set(mockList);
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-456');
      mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('lib-2');

      await component.ngOnInit();

      expect(mockViewerService.loadList).toHaveBeenCalledWith('chat-456', { autoSelect: false });
      expect(mockViewerService.selectLibrary).toHaveBeenCalledWith({
        id: 'lib-2',
        title: 'ドキュメント2',
      });
    });

    test('libraryIdが一覧に存在しない場合、showLibraryで直接読み込むこと', async () => {
      mockViewers.set([{ id: 'lib-1', title: 'ドキュメント1' }]);
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-456');
      mockActivatedRoute.snapshot.queryParamMap.get.mockReturnValue('missing-lib');

      await component.ngOnInit();

      expect(mockViewerService.selectLibrary).not.toHaveBeenCalled();
      expect(mockViewerService.showLibrary).toHaveBeenCalledWith({
        id: 'missing-lib',
        title: '',
      });
    });
  });

  describe('DOM要素表示', () => {
    test('app-chat-summaryが表示されること', async () => {
      await component.ngOnInit();
      fixture.detectChanges();

      const summaryEl = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(summaryEl).toBeTruthy();
    });

    test('app-chat-summaryにchatIdが渡されること', async () => {
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-001');
      await component.ngOnInit();
      fixture.detectChanges();

      const summaryEl = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(summaryEl.componentInstance.chatId()).toBe('chat-001');
    });

    test('app-chat-summaryにisDetailPage=trueが渡されること', async () => {
      await component.ngOnInit();
      fixture.detectChanges();

      const summaryEl = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(summaryEl.componentInstance.isDetailPage()).toBe(true);
    });

    test('app-chat-summaryにheaderOptionsが渡されること', async () => {
      const mockList: ViewerListItem[] = [{ id: '1', title: 'テスト' }];
      mockViewers.set(mockList);
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('chat-002');

      await component.ngOnInit();
      fixture.detectChanges();

      const summaryEl = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(summaryEl.componentInstance.headerOptions()).toEqual(mockList);
    });

    test('コンテナにh-screen w-fullクラスが適用されていること', async () => {
      await component.ngOnInit();
      fixture.detectChanges();

      const container = fixture.debugElement.query(By.css('div.h-screen'));
      expect(container).toBeTruthy();
    });
  });
});
