import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { ChatHistoryPageComponent } from './chat-history.component';
import { ChatHistoryStore } from './stores/chat-history.store';
import { ChatHistoryApiService } from './services/chat-history-api.service';
import type { ChatHistoryFilterChange } from './components/chat-history-filter/chat-history-filter.component';
import type { ChatHistoryFilter, ChatHistoryItem } from '@app-types/chat-history.types';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Mock TranslateService ---------------
const langChangeSubject = new Subject<{ lang: string }>();
const mockTranslateService = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  currentLang: 'ja',
  onLangChange: langChangeSubject.asObservable(),
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

// --------------- Mock ChatHistoryStore (signals) ---------------
const filter = signal<ChatHistoryFilter>({
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt',
  sortOrder: 'desc',
});
const totalItems = signal(0);
const totalPages = signal(1);
const pageRange = signal({ from: 0, to: 0, total: 0 });
const isLoading = signal(false);
const items = signal<ChatHistoryItem[]>([]);

const mockStore = {
  loadItems: vi.fn(),
  updateFilter: vi.fn(),
  updatePageSize: vi.fn(),
  updatePageIndex: vi.fn(),
  filter,
  totalItems,
  totalPages,
  pageRange,
  isLoading,
  items,
};

const mockApi = {
  listUsers: vi.fn().mockResolvedValue([]),
  list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
};

// --------------- Stubs ---------------
@Component({ selector: 'app-admin-page-shell', standalone: true, template: '<ng-content />' })
class AdminPageShellStub {
  readonly title = input<string>('');
  readonly titleKey = input<string>('');
  readonly showSidebarToggle = input<boolean>(true);
  readonly showActions = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(true);
  readonly customHeader = input<boolean>(false);
}

@Component({ selector: 'app-chat-history-filter', standalone: true, template: '' })
class ChatHistoryFilterStub {
  readonly pageSize = input<number>(10);
  readonly pageIndex = input<number>(1);
  readonly totalItems = input<number>(0);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');
  readonly userOptions = input<{ label: string; value: string }[]>([]);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
  readonly pageIndexChange = output<number>();
  readonly filterChange = output<ChatHistoryFilterChange>();
}

@Component({ selector: 'app-chat-history-list', standalone: true, template: '' })
class ChatHistoryListStub {
  readonly items = input.required<ChatHistoryItem[]>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input.required<number>();
  readonly maxVisiblePages = input<number>(5);
  readonly pageSizeOptions = input<number[]>([10, 20, 50]);
  readonly showPageSize = input<boolean>(true);
  readonly showPageSizeLabel = input<boolean>(true);
  readonly showPageNumbers = input<boolean>(true);
  readonly showFirstLast = input<boolean>(true);
  readonly countDisplay = input<string>('');
  readonly useQueryParams = input<boolean>(true);
  readonly currentPageOverride = input<number | null>(null);
  readonly pageSizeOverride = input<number | null>(null);
  readonly pageParamName = input<string>('page');
  readonly pageSizeParamName = input<string>('pageSize');
  readonly defaultPageSize = input<number>(10);
  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();
}

// ================================================================
describe('ChatHistoryPageComponent', () => {
  let fixture: ComponentFixture<ChatHistoryPageComponent>;
  let component: ChatHistoryPageComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Pin "today" so resolvePeriodRange produces deterministic dates
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T12:00:00'));
    // Reset shared mock signals to a clean baseline before each test
    filter.set({ pageSize: 10, pageIndex: 1, sortField: 'updatedAt', sortOrder: 'desc' });
    totalItems.set(0);
    totalPages.set(1);
    pageRange.set({ from: 0, to: 0, total: 0 });
    isLoading.set(false);
    items.set([]);
    mockTranslateService.instant.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [ChatHistoryPageComponent, NoopAnimationsModule],
      providers: [
        { provide: ChatHistoryStore, useValue: mockStore },
        { provide: ChatHistoryApiService, useValue: mockApi },
        { provide: TranslateService, useValue: mockTranslateService },
      ],
    })
      .overrideComponent(ChatHistoryPageComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            AdminPageShellStub,
            ChatHistoryFilterStub,
            ChatHistoryListStub,
            PaginationStub,
            MatProgressSpinnerModule,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ChatHistoryPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ================================================================
  describe('初期値・ゲッター', () => {
    test('totalが0のときcountDisplayが空文字を返すこと', () => {
      pageRange.set({ from: 0, to: 0, total: 0 });
      expect(component.countDisplay()).toBe('');
    });

    test('totalが0より大きいときcountDisplayがCHAT_HISTORY.PAGE_COUNTキーを返すこと', () => {
      pageRange.set({ from: 1, to: 10, total: 25 });
      expect(component.countDisplay()).toBe('CHAT_HISTORY.PAGE_COUNT');
      expect(mockTranslateService.instant).toHaveBeenCalledWith('CHAT_HISTORY.PAGE_COUNT', {
        from: 1,
        to: 10,
        total: 25,
      });
    });

    test('ngOnInitでstore.loadItemsが呼ばれること', () => {
      // detectChanges() in beforeEach triggers ngOnInit
      expect(mockStore.loadItems).toHaveBeenCalledTimes(1);
    });
  });

  // ================================================================
  describe('DOM要素表示', () => {
    test('admin-page-shellにtitleKey="CHAT_HISTORY.TITLE"が渡されること', () => {
      const shell = fixture.debugElement.query(By.directive(AdminPageShellStub));
      expect(shell).toBeTruthy();
      expect(shell.componentInstance.titleKey()).toBe('CHAT_HISTORY.TITLE');
    });

    test('chat-history-filterにstore.filterのpageSize/pageIndexが渡されること', () => {
      filter.set({ pageSize: 25, pageIndex: 3, sortField: 'updatedAt', sortOrder: 'desc' });
      fixture.detectChanges();
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      expect(filterEl.componentInstance.pageSize()).toBe(25);
      expect(filterEl.componentInstance.pageIndex()).toBe(3);
    });

    test('chat-history-filterにstore.totalItems/totalPagesが渡されること', () => {
      totalItems.set(42);
      totalPages.set(5);
      fixture.detectChanges();
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      expect(filterEl.componentInstance.totalItems()).toBe(42);
      expect(filterEl.componentInstance.totalPages()).toBe(5);
    });

    test('chat-history-filterにcountDisplayが渡されること', () => {
      pageRange.set({ from: 1, to: 10, total: 25 });
      fixture.detectChanges();
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      expect(filterEl.componentInstance.countDisplay()).toBe('CHAT_HISTORY.PAGE_COUNT');
    });

    test('isLoadingがtrueのときmat-spinnerが表示されること', () => {
      isLoading.set(true);
      fixture.detectChanges();
      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
    });

    test('isLoadingがtrueのときchat-history-listが表示されないこと', () => {
      isLoading.set(true);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.directive(ChatHistoryListStub));
      expect(list).toBeFalsy();
    });

    test('isLoadingがfalseのときchat-history-listにstore.itemsが渡されること', () => {
      const sample: ChatHistoryItem[] = [
        {
          id: '1',
          userId: 'user-1',
          date: '2025/09/29 20:05',
          userName: '苗字 名前',
          roomName: 'Sample',
        },
      ];
      items.set(sample);
      isLoading.set(false);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.directive(ChatHistoryListStub));
      expect(list).toBeTruthy();
      expect(list.componentInstance.items()).toEqual(sample);
    });

    test('totalItemsが0より大きい場合、下部paginationが表示されること', () => {
      totalItems.set(20);
      totalPages.set(2);
      isLoading.set(false);
      fixture.detectChanges();
      const paginations = fixture.debugElement.queryAll(By.directive(PaginationStub));
      expect(paginations.length).toBe(1);
    });

    test('totalItemsが0の場合、下部paginationが表示されないこと', () => {
      totalItems.set(0);
      fixture.detectChanges();
      const paginations = fixture.debugElement.queryAll(By.directive(PaginationStub));
      expect(paginations.length).toBe(0);
    });
  });

  // ================================================================
  describe('DOM要素イベント', () => {
    test('filterのpageSizeChangeでstore.updatePageSizeが呼ばれること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.pageSizeChange.emit(25);
      expect(mockStore.updatePageSize).toHaveBeenCalledWith(25);
    });

    test('filterのpageIndexChangeでstore.updatePageIndexが呼ばれること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.pageIndexChange.emit(3);
      expect(mockStore.updatePageIndex).toHaveBeenCalledWith(3);
    });

    test('プリセット7daysで(today-6 → today)のISO日付がstore.updateFilterに渡されること', () => {
      // System date is pinned to 2026-05-01 in beforeEach
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      const event: ChatHistoryFilterChange = {
        period: '7days',
        periodRange: null,
        user: 'me',
        query: 'hello',
        sortField: 'roomName',
        sortOrder: 'asc',
      };
      filterEl.componentInstance.filterChange.emit(event);
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        query: 'hello',
        userId: 'me',
        period: '7days',
        periodFrom: '2026-04-25',
        periodTo: '2026-05-01',
        sortField: 'roomName',
        sortOrder: 'asc',
      });
    });

    test('プリセットtodayで(today → today)のISO日付がstore.updateFilterに渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: 'today',
        periodRange: null,
        user: 'all',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.periodFrom).toBe('2026-05-01');
      expect(arg.periodTo).toBe('2026-05-01');
    });

    test('プリセット30daysで(today-29 → today)のISO日付がstore.updateFilterに渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: '30days',
        periodRange: null,
        user: 'all',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.periodFrom).toBe('2026-04-02');
      expect(arg.periodTo).toBe('2026-05-01');
    });

    test('プリセット未選択時はperiodFrom/periodToがundefinedで渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: '',
        periodRange: null,
        user: 'all',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.periodFrom).toBeUndefined();
      expect(arg.periodTo).toBeUndefined();
    });

    test('user=allのときuserIdがundefinedで渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: '',
        periodRange: null,
        user: 'all',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.userId).toBeUndefined();
    });

    test('queryが空文字のときqueryがundefinedで渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: '',
        periodRange: null,
        user: 'me',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.query).toBeUndefined();
    });

    test('periodRangeがあるときperiodFrom/periodToがstore.updateFilterに渡されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(ChatHistoryFilterStub));
      filterEl.componentInstance.filterChange.emit({
        period: 'custom',
        periodRange: { from: '2025/09/01', to: '2025/09/30' },
        user: 'all',
        query: '',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.period).toBe('custom');
      expect(arg.periodFrom).toBe('2025/09/01');
      expect(arg.periodTo).toBe('2025/09/30');
    });

    test('下部paginationのpageChangeでstore.updatePageIndexが呼ばれること', () => {
      totalItems.set(20);
      totalPages.set(2);
      fixture.detectChanges();
      const pagination = fixture.debugElement.query(By.directive(PaginationStub));
      pagination.componentInstance.pageChange.emit(2);
      expect(mockStore.updatePageIndex).toHaveBeenCalledWith(2);
    });
  });
});
