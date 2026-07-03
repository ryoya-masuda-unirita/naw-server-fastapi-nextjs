import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, input, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LibraryDetailComponent } from './library-detail.component';
import { ViewerService } from '@features/chat/services/viewer.service';
import { ViewerListItem } from '@core/constants/mock-data/viewer-content.mock';
import { ChatSummaryComponent } from '@app/shared/components/features/chat/chat-summary/chat-summary.component';

@Component({ selector: 'app-chat-summary', standalone: true, template: '' })
class ChatSummaryStub {
  readonly chatId = input<string | null>(null);
  readonly isDetailPage = input<boolean>(false);
  readonly headerOptions = input<ViewerListItem[]>([]);
}

const mockRouter = { navigate: vi.fn() };

const activeLibrarySignal = signal<ViewerListItem | null>(null);

const mockViewerService = {
  showLibrary: vi.fn().mockImplementation(async (library: ViewerListItem) => {
    activeLibrarySignal.set({ id: library.id, title: 'APIから取得したタイトル' });
  }),
  activeLibrary: activeLibrarySignal,
};

const mockActivatedRoute = {
  snapshot: {
    paramMap: { get: vi.fn().mockReturnValue('lib-123') },
  },
};

describe('LibraryDetailComponent', () => {
  let component: LibraryDetailComponent;
  let fixture: ComponentFixture<LibraryDetailComponent>;

  beforeEach(async () => {
    activeLibrarySignal.set(null);
    mockViewerService.showLibrary.mockImplementation(async (library: ViewerListItem) => {
      activeLibrarySignal.set({ id: library.id, title: 'APIから取得したタイトル' });
    });
    mockActivatedRoute.snapshot.paramMap.get.mockReturnValue('lib-123');

    await TestBed.configureTestingModule({
      imports: [LibraryDetailComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: ViewerService, useValue: mockViewerService },
      ],
    })
      .overrideComponent(LibraryDetailComponent, {
        remove: { imports: [ChatSummaryComponent] },
        add: { imports: [ChatSummaryStub] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(LibraryDetailComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期値', () => {
    test('libraryId の初期値が null であること', () => {
      expect(component.libraryId()).toBeNull();
    });

    test('headerOptions の初期値が空配列であること', () => {
      expect(component.headerOptions()).toEqual([]);
    });
  });

  describe('ngOnInit', () => {
    test('ルートパラメータからlibraryIdが設定されること', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.libraryId()).toBe('lib-123');
    });

    test('viewerService.showLibrary がルートIDで呼ばれること', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockViewerService.showLibrary).toHaveBeenCalledWith({
        id: 'lib-123',
        title: '',
      });
    });

    test('showLibrary 後に API から取得したタイトルで headerOptions が設定されること', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.headerOptions()).toEqual([
        { id: 'lib-123', title: 'APIから取得したタイトル' },
      ]);
    });

    test('ルートパラメータが null のとき showLibrary が呼ばれないこと', async () => {
      mockActivatedRoute.snapshot.paramMap.get.mockReturnValue(null);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.libraryId()).toBeNull();
      expect(mockViewerService.showLibrary).not.toHaveBeenCalled();
    });
  });

  describe('DOM要素表示', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    test('app-chat-summary が表示されること', () => {
      const el = fixture.debugElement.query(By.css('app-chat-summary'));
      expect(el).toBeTruthy();
    });

    test('app-chat-summary に isDetailPage=true が渡されること', () => {
      const el = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(el.componentInstance.isDetailPage()).toBe(true);
    });

    test('app-chat-summary に libraryId が chatId として渡されること', () => {
      const el = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(el.componentInstance.chatId()).toBe('lib-123');
    });

    test('app-chat-summary に headerOptions が渡されること', () => {
      const el = fixture.debugElement.query(By.directive(ChatSummaryStub));
      expect(el.componentInstance.headerOptions()).toEqual([
        { id: 'lib-123', title: 'APIから取得したタイトル' },
      ]);
    });
  });

  describe('DOM要素イベント', () => {
    beforeEach(async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    test('goBack() を呼ぶと router.navigate が実行されること', () => {
      component.goBack();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['../'], {
        relativeTo: mockActivatedRoute,
      });
    });
  });
});
