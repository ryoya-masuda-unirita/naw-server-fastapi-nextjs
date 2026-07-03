import { Component, input, model, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { ContentTabComponent } from './content-tab.component';
import { LibraryPageItem } from '@app-types/admin/library.types';
import { SortOption } from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { SelectOption } from '@app-types/common';
import { LibraryStore } from './library.store';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';

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
  currentLang: 'ja',
  onLangChange: langChangeSubject.asObservable(),
  onTranslationChange: { pipe: vi.fn(() => ({ subscribe: vi.fn() })), subscribe: vi.fn() },
  onDefaultLangChange: { pipe: vi.fn(() => ({ subscribe: vi.fn() })), subscribe: vi.fn() },
};

// --------------- Mock Router ---------------
const mockRouter = {
  navigate: vi.fn(),
};

// --------------- Mock MatDialog ---------------
const mockDialog = {
  open: vi.fn(),
  closeAll: vi.fn(),
};

// --------------- Mock ToastService ---------------
const mockToastService = {
  error: vi.fn(),
};

// --------------- Mock UserService ---------------
// /users/profile が返すログインユーザのUUID。フィクスチャの作成者(userId)と一致させ、
// 所有者として編集・削除メニューが表示される状態にする
const mockUserService = {
  profileQuery: { data: signal<{ id: string } | undefined>({ id: 'user-001' }) },
};

// --------------- フィクスチャデータ ---------------
const FIXTURE_ITEM: LibraryPageItem = {
  id: '1',
  title: 'コンテンツの名前',
  userId: 'user-001',
  updatedAt: '2025-09-29T00:00:00.000Z',
  tags: [{ id: 'tag-1', name: 'タグA' }],
  sharedGroups: [{ id: 'group-1', name: 'グループA' }],
};

const FIXTURE_ITEMS: LibraryPageItem[] = [
  FIXTURE_ITEM,
  {
    id: '2',
    title: '別のコンテンツ',
    userId: 'user-002',
    updatedAt: '2025-09-28T00:00:00.000Z',
    tags: [],
    sharedGroups: [],
  },
];

// --------------- Store モック ---------------
function createMockStore() {
  return {
    items: signal<LibraryPageItem[]>([]),
    isLoading: signal(false),
    totalElements: signal(0),
    tagOptions: signal<{ id: string; name: string }[]>([]),
    filterTitle: signal(''),
    filterUserMode: signal<'' | 'mine' | 'others'>(''),
    filterTagId: signal(''),
    sortBy: signal('updatedAt'),
    sortDir: signal('desc'),
    currentPage: signal(1),
    pageSize: signal(5),
    totalPages: signal(1),
    countDisplay: signal('0件'),
    loadLibraries: vi.fn().mockResolvedValue(undefined),
    changePage: vi.fn().mockResolvedValue(undefined),
    changeTitle: vi.fn().mockResolvedValue(undefined),
    changeUserMode: vi.fn().mockResolvedValue(undefined),
    changeTagFilter: vi.fn().mockResolvedValue(undefined),
    changeSort: vi.fn().mockResolvedValue(undefined),
    updateItem: vi.fn().mockResolvedValue(true),
    deleteItem: vi.fn().mockResolvedValue(true),
  };
}

// --------------- Stubs ---------------
@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  size = input<string>('');
  value = input<string>('');
  placeholder = input<string>('');
  valueChange = output<string>();
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  options = input<SelectOption[]>([]);
  value = input<string | null>(null);
  placeholder = input<string>('');
  size = input<string>('');
  disabled = input<boolean>(false);
  supportText = input<string>('');
  valueChange = output<string | null>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  id = input<string>('');
  size = input<string>('');
  fields = input<SortOption[]>([]);
  selectedField = model<string | null>(null);
  selectedOrder = model<string | null>(null);
  placeholder = input<string>('');
  fieldChange = output<string | null>();
  orderChange = output<string | null>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  totalPages = input<number>(0);
  useQueryParams = input<boolean>(true);
  showPageSize = input<boolean>(true);
  showPageNumbers = input<boolean>(true);
  showFirstLast = input<boolean>(true);
  currentPageOverride = input<number | undefined>(undefined);
  countDisplay = input<string>('');
  pageChange = output<number>();
}

@Component({ selector: 'app-table', standalone: true, template: '' })
class TableStub {
  data = input<unknown[]>([]);
  columns = input<unknown[]>([]);
  actionsTemplate = input<unknown>(null);
  actionsWidth = input<string>('');
}

@Component({ selector: 'app-library-item-menu', standalone: true, template: '' })
class LibraryItemMenuStub {
  item = input.required<LibraryPageItem>();
  isOwner = input<boolean>(true);
  editSettings = output<LibraryPageItem>();
  copyLink = output<LibraryPageItem>();
  deleteItem = output<LibraryPageItem>();
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  variant = input<string>('');
  size = input<string>('');
  fullWidth = input<boolean>(false);
  buttonClick = output<void>();
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class AppMatIconStub {
  icon = input<string>('');
}

@Component({ selector: 'app-skeleton', standalone: true, template: '' })
class SkeletonStub {
  readonly variant = input<string>('rect');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly rounded = input<string>('rounded');
}

// ================================================================
describe('ContentTabComponent', () => {
  let fixture: ComponentFixture<ContentTabComponent>;
  let component: ContentTabComponent;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStore = createMockStore();
    mockTranslateService.instant.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [ContentTabComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: Router, useValue: mockRouter },
        { provide: MatDialog, useValue: mockDialog },
        { provide: LibraryStore, useValue: mockStore },
        { provide: ToastService, useValue: mockToastService },
        { provide: UserService, useValue: mockUserService },
      ],
    })
      .overrideComponent(ContentTabComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            SearchInputStub,
            SelectStub,
            FormSortInputStub,
            PaginationStub,
            TableStub,
            LibraryItemMenuStub,
            ButtonStub,
            AppMatIconStub,
            SkeletonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ContentTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ================================================================
  describe('初期表示', () => {
    test('初期化時に一覧がロードされること', () => {
      expect(mockStore.loadLibraries).toHaveBeenCalledOnce();
    });

    test('ロード中はスケルトンが表示されること', () => {
      mockStore.isLoading.set(true);
      fixture.detectChanges();
      const skeletons = fixture.debugElement.queryAll(By.css('app-skeleton'));
      expect(skeletons.length).toBeGreaterThan(0);
    });

    test('一覧取得後にテーブルが表示されること', () => {
      mockStore.items.set(FIXTURE_ITEMS);
      fixture.detectChanges();
      const table = fixture.debugElement.query(By.css('app-table'));
      expect(table).toBeTruthy();
      expect((table.componentInstance as TableStub).data()).toEqual(FIXTURE_ITEMS);
    });

    test('件数表示がページネーションに渡されること', () => {
      mockStore.countDisplay.set('1-2件 / 2件');
      fixture.detectChanges();
      const pagination = fixture.debugElement.query(By.css('app-pagination'));
      expect((pagination.componentInstance as PaginationStub).countDisplay()).toBe('1-2件 / 2件');
    });

    test('コンテンツタイプフィルターは表示されないこと', () => {
      const selects = fixture.debugElement.queryAll(By.css('app-select'));
      expect(selects.length).toBe(2);
    });
  });

  // ================================================================
  describe('検索・フィルター', () => {
    test('検索キーワードを入力すると一覧が絞り込まれること', async () => {
      vi.useFakeTimers();
      try {
        component.onSearchValueChange('予実');
        await vi.advanceTimersByTimeAsync(300);
        expect(mockStore.changeTitle).toHaveBeenCalledWith('予実');
      } finally {
        vi.useRealTimers();
      }
    });

    test('ユーザーフィルターを変更すると一覧が絞り込まれること', () => {
      component.onUserFilterChange('mine');
      expect(mockStore.changeUserMode).toHaveBeenCalledWith('mine');
    });

    test('ユーザーフィルターをクリアすると全件表示に戻ること', () => {
      component.onUserFilterChange(null);
      expect(mockStore.changeUserMode).toHaveBeenCalledWith('');
    });

    test('タグフィルターを変更すると一覧が絞り込まれること', () => {
      component.onTagFilterChange('tag-1');
      expect(mockStore.changeTagFilter).toHaveBeenCalledWith('tag-1');
    });
  });

  // ================================================================
  describe('ソート', () => {
    test('ソートフィールドを変更すると一覧が並び替えられること', () => {
      component.sortField.set('title');
      component.sortOrder.set('desc');
      component.onSortFieldChange();
      expect(mockStore.changeSort).toHaveBeenCalledWith('title', 'desc');
    });

    test('ソート順を変更すると一覧が並び替えられること', () => {
      component.sortField.set('updatedAt');
      component.sortOrder.set('asc');
      component.onSortOrderChange();
      expect(mockStore.changeSort).toHaveBeenCalledWith('updatedAt', 'asc');
    });
  });

  // ================================================================
  describe('ページネーション', () => {
    test('ページを変更すると該当ページの一覧が取得されること', () => {
      component.onPageChange(3);
      expect(mockStore.changePage).toHaveBeenCalledWith(3);
    });
  });

  // ================================================================
  describe('詳細遷移', () => {
    test('アイテムをクリックすると詳細画面へ遷移すること', () => {
      component.onItemAction(FIXTURE_ITEM);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/library/1']);
    });
  });

  // ================================================================
  describe('設定編集ダイアログ', () => {
    test('設定編集ダイアログを開けること', () => {
      component.onEditSettings(FIXTURE_ITEM);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('保存すると入力内容で一覧が更新されること', async () => {
      component.onEditSettings(FIXTURE_ITEM);
      const openArgs = mockDialog.open.mock.calls[0][1] as {
        data: {
          contentComponentInputs: {
            onValueChange: (payload: { name: string; tags: string[]; groups: string[] }) => void;
          };
        };
      };
      const payload = { name: '更新後の名前', tags: ['tag-2'], groups: [] };
      openArgs.data.contentComponentInputs.onValueChange(payload);

      await component.saveEditSettings();

      expect(mockStore.updateItem).toHaveBeenCalledWith(FIXTURE_ITEM.id, payload);
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('キャンセルするとダイアログが閉じること', () => {
      component.closeEditSettingsDialog();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('保存に失敗した場合はユーザ向けエラートーストを表示しダイアログを閉じないこと', async () => {
      mockStore.updateItem.mockResolvedValueOnce(false);
      component.onEditSettings(FIXTURE_ITEM);
      await component.saveEditSettings();
      expect(mockToastService.error).toHaveBeenCalledWith('ADMIN.LIBRARY.UPDATE_FAILED');
      expect(mockDialog.closeAll).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  describe('共有リンクのコピー', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
    });

    test('共有リンクをコピーするとライブラリ詳細URLがクリップボードに書き込まれること', () => {
      component.onCopyLink(FIXTURE_ITEM);

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/library/${FIXTURE_ITEM.id}`,
      );
    });
  });

  // ================================================================
  describe('削除確認ダイアログ', () => {
    test('削除確認ダイアログを開けること', () => {
      component.onDeleteItem(FIXTURE_ITEM);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('削除を確定すると一覧から削除されること', async () => {
      component.onDeleteItem(FIXTURE_ITEM);
      const openArgs = mockDialog.open.mock.calls[0][1] as {
        data: { confirmAction?: () => Promise<void> };
      };
      await openArgs.data.confirmAction?.();
      expect(mockStore.deleteItem).toHaveBeenCalledWith(FIXTURE_ITEM.id);
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('削除に失敗した場合はユーザ向けエラートーストを表示すること', async () => {
      mockStore.deleteItem.mockResolvedValue(false);
      component.onDeleteItem(FIXTURE_ITEM);
      const openArgs = mockDialog.open.mock.calls[0][1] as {
        data: { confirmAction?: () => Promise<void> };
      };
      await openArgs.data.confirmAction?.();
      expect(mockToastService.error).toHaveBeenCalledWith('ADMIN.LIBRARY.DELETE_FAILED');
      expect(mockDialog.closeAll).not.toHaveBeenCalled();
    });
  });
});
