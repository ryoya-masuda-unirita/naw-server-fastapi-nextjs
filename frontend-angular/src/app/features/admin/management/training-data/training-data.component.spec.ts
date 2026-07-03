import { Component, forwardRef, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { TrainingDataComponent } from './training-data.component';
import { TrainingDataStore } from './stores/training-data.store';
import { TrainingFolderModalService } from './services/training-folder-modal.service';
import { DEFAULT_TRAINING_DATA_FILTER } from './training-data.constants';
import { TrainingDataFilter, TrainingDataItem } from '@app-types/training-data.types';
import { ReactiveFormsModule, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

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

// --------------- Mock TrainingDataStore ---------------
const filter = signal<TrainingDataFilter>(DEFAULT_TRAINING_DATA_FILTER);
const totalItems = signal(0);
const totalPages = signal(1);
const pageRange = signal({ from: 0, to: 0, total: 0 });
const isLoading = signal(false);
const items = signal<TrainingDataItem[]>([]);

const mockStore = {
  loadItems: vi.fn(),
  updateFilter: vi.fn(),
  updatePageIndex: vi.fn(),
  updatePageSize: vi.fn(),
  createFolder: vi.fn().mockResolvedValue(undefined),
  filter,
  totalItems,
  totalPages,
  pageRange,
  isLoading,
  items,
};

const folderModalLoading = signal(false);
const folderModalHasNoEndpoints = signal(false);
const folderModalEndpointOptions = signal<{ value: string; label: string }[]>([
  { value: 'ep-local-1', label: 'Local Server 1' },
]);
const folderModalSelectedEndpointIds = signal<string[]>(['ep-local-1']);

const mockFolderModal = {
  isLoading: folderModalLoading,
  endpointOptions: folderModalEndpointOptions,
  hasNoEndpoints: folderModalHasNoEndpoints,
  selectedEndpointIds: folderModalSelectedEndpointIds,
  reset: vi.fn(() => {
    folderModalLoading.set(false);
    folderModalHasNoEndpoints.set(false);
    folderModalEndpointOptions.set([{ value: 'ep-local-1', label: 'Local Server 1' }]);
    folderModalSelectedEndpointIds.set(['ep-local-1']);
  }),
  initializeGroups: vi.fn().mockResolvedValue(undefined),
  loadEndpointsForType: vi.fn().mockResolvedValue('ep-local-1'),
  getGroupIds: vi.fn(() => ['group-1']),
};

// --------------- Mock MatDialog ---------------
const mockDialog = {
  open: vi.fn(),
  closeAll: vi.fn(),
};

// --------------- Mock Router ---------------
const mockRouter = {
  navigate: vi.fn(),
};

// --------------- Stubs ---------------
@Component({ selector: 'app-page-header', standalone: true, template: '' })
class PageHeaderStub {
  readonly title = input<string>('');
  readonly titleKey = input<string>('');
  readonly showSidebarToggle = input<boolean>(true);
  readonly showActions = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(true);
  readonly showBackButton = input<boolean>(false);
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly iconPosition = input<string>('left');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly buttonClick = output<void>();
}

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  readonly placeholder = input<string>('');
  readonly size = input<string>('medium');
  readonly value = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly selectedField = input<string | null>(null);
  readonly selectedOrder = input<string | null>(null);
  readonly fields = input<any[]>([]);
  readonly placeholder = input<string>('');
  readonly fieldChange = output<string | null>();
  readonly orderChange = output<string>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input.required<number>();
  readonly maxVisiblePages = input<number>(5);
  readonly useQueryParams = input<boolean>(true);
  readonly showPageSize = input<boolean>(true);
  readonly showPageNumbers = input<boolean>(true);
  readonly showFirstLast = input<boolean>(true);
  readonly currentPageOverride = input<number | null>(null);
  readonly countDisplay = input<string>('');
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
  readonly icon = input<boolean>(false);
}

@Component({
  selector: 'app-form-input',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormInputStub), multi: true },
  ],
})
class FormInputStub implements ControlValueAccessor {
  readonly id = input<string>('');
  readonly name = input<string>('');
  readonly label = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly value = input<string>('');
  readonly error = input<string>('');
  readonly badgeText = input<string>('');
  readonly valueChange = output<string>();

  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

@Component({
  selector: 'app-form-radio',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormRadioStub), multi: true },
  ],
})
class FormRadioStub implements ControlValueAccessor {
  readonly name = input<string>('');
  readonly label = input<string>('');
  readonly supportText = input<string>('');
  readonly layout = input<string>('horizontal');
  readonly options = input<any[]>([]);
  readonly value = input<any>(null);
  readonly classOption = input<string>('');
  readonly valueChange = output<any>();

  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

@Component({
  selector: 'app-form-textarea',
  standalone: true,
  template: '',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => FormTextareaStub), multi: true },
  ],
})
class FormTextareaStub implements ControlValueAccessor {
  readonly name = input<string>('');
  readonly label = input<string>('');
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly value = input<string>('');
  readonly valueChange = output<string>();
  readonly rows = input<number>(3);
  readonly areaHeight = input<number>(144);
  readonly error = input<string>('');

  writeValue(): void {
    // Empty
  }
  registerOnChange(): void {
    // Empty
  }
  registerOnTouched(): void {
    // Empty
  }
}

describe('TrainingDataComponent', () => {
  let fixture: ComponentFixture<TrainingDataComponent>;
  let component: TrainingDataComponent;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset signals
    filter.set(DEFAULT_TRAINING_DATA_FILTER);
    totalItems.set(0);
    totalPages.set(1);
    pageRange.set({ from: 0, to: 0, total: 0 });
    isLoading.set(false);
    items.set([]);
    mockTranslateService.instant.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [TrainingDataComponent, NoopAnimationsModule],
      providers: [
        { provide: TrainingDataStore, useValue: mockStore },
        { provide: TrainingFolderModalService, useValue: mockFolderModal },
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
      ],
    })
      .overrideComponent(TrainingDataComponent, {
        set: {
          imports: [
            CommonModule,
            ReactiveFormsModule,
            FakeTranslatePipe,
            PageHeaderStub,
            ButtonStub,
            SearchInputStub,
            FormSortInputStub,
            PaginationStub,
            SvgIconStub,
            FormInputStub,
            FormRadioStub,
            FormTextareaStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TrainingDataComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期値・ゲッター', () => {
    test('初期化時にstore.loadItemsが呼ばれること', () => {
      expect(mockStore.loadItems).toHaveBeenCalled();
    });

    test('countDisplayが空文字を返すこと (total=0)', () => {
      pageRange.set({ from: 0, to: 0, total: 0 });
      expect(component.countDisplay()).toBe('');
    });

    test('countDisplay가正しい件数表示を返すこと (total>0)', () => {
      pageRange.set({ from: 1, to: 5, total: 12 });
      expect(component.countDisplay()).toBe('1-5件 / 12件');
    });

    test('初期ソート状態が正しいこと', () => {
      expect(component.sortField()).toBeNull();
      expect(component.sortDir()).toBeNull();
    });
  });

  describe('DOM要素表示', () => {
    test('ページヘッダーが表示されること', () => {
      const header = fixture.debugElement.query(By.directive(PageHeaderStub));
      expect(header).toBeTruthy();
      expect(header.componentInstance.titleKey()).toBe('LEARNING_DATA.LEARNING_DATA');
    });

    test('新規作成ボタンが表示されること', () => {
      const btns = fixture.debugElement.queryAll(By.directive(ButtonStub));
      const createBtn = btns.find((b) =>
        b.nativeElement.textContent.includes('LEARNING_DATA.CREATE_NEW_FOLDER'),
      );
      expect(createBtn).toBeTruthy();
    });

    test('検索入力フィールドが表示されること', () => {
      const search = fixture.debugElement.query(By.directive(SearchInputStub));
      expect(search).toBeTruthy();
    });

    test('ソート入力フィールドが表示されること', () => {
      const sort = fixture.debugElement.query(By.directive(FormSortInputStub));
      expect(sort).toBeTruthy();
    });

    test('読み込み中はカードが表示されないこと', () => {
      isLoading.set(true);
      items.set([]);
      fixture.detectChanges();
      const cards = fixture.debugElement.queryAll(By.css('.term-card'));
      expect(cards.length).toBe(0);
    });

    test('アイテムがあるときカードが表示されること', () => {
      items.set([
        {
          id: '1',
          folder: 'Folder 1',
          server: 'local',
          desc: 'Desc 1',
          link: 'link1',
          updatedAt: '2024-01-01',
        },
      ]);
      fixture.detectChanges();
      const card = fixture.debugElement.query(By.css('.term-card'));
      expect(card).toBeTruthy();
      expect(card.nativeElement.textContent).toContain('Folder 1');
    });

    test('ページネーションが表示されること', () => {
      totalPages.set(5);
      fixture.detectChanges();
      const paginations = fixture.debugElement.queryAll(By.directive(PaginationStub));
      expect(paginations.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('DOM要素イベント', () => {
    test('新規作成ボタンクリックでモーダルが開くこと', () => {
      const btns = fixture.debugElement.queryAll(By.directive(ButtonStub));
      const createBtn = btns.find((b) =>
        b.nativeElement.textContent.includes('LEARNING_DATA.CREATE_NEW_FOLDER'),
      );
      createBtn?.triggerEventHandler('buttonClick', null);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('検索入力でフィルターが更新されること', () => {
      const search = fixture.debugElement.query(By.directive(SearchInputStub));
      search.triggerEventHandler('valueChange', 'test query');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ query: 'test query' });
    });

    test('ソート項目変更でフィルターが更新されること', () => {
      const sort = fixture.debugElement.query(By.directive(FormSortInputStub));
      sort.triggerEventHandler('fieldChange', 'name');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ sortField: 'name' });
    });

    test('ソート順変更でフィルターが更新されること', () => {
      const sort = fixture.debugElement.query(By.directive(FormSortInputStub));
      sort.triggerEventHandler('orderChange', 'asc');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ sortOrder: 'asc' });
    });

    test('ページ変更でページインデックスが更新されること', () => {
      const pagination = fixture.debugElement.query(By.directive(PaginationStub));
      pagination.triggerEventHandler('pageChange', 2);
      expect(mockStore.updatePageIndex).toHaveBeenCalledWith(2);
    });

    test('カードの「表示・編集」ボタンクリックで詳細画面へ遷移すること', () => {
      items.set([
        {
          id: 'folder-123',
          folder: 'Folder 1',
          server: 'local',
          desc: 'Desc 1',
          link: 'link1',
          updatedAt: '2024-01-01',
        },
      ]);
      fixture.detectChanges();
      const card = fixture.debugElement.query(By.css('.term-card'));
      const detailBtn = card.query(By.directive(ButtonStub));
      detailBtn.triggerEventHandler('buttonClick', null);
      expect(mockRouter.navigate).toHaveBeenCalledWith([expect.stringContaining('folder-123')]);
    });
  });

  describe('モーダル内バリデーション・操作', () => {
    beforeEach(() => {
      component.openCreateModal();
      fixture.detectChanges();
    });

    test('名前が空のときバリデーションエラーになること', () => {
      const nameCtrl = component.createFolderForm.get('name');
      nameCtrl?.setValue('');
      component.submitted.set(true);
      fixture.detectChanges();

      expect(component.isCreateFolderValid()).toBe(false);
      expect(component.folderNameError()).toBe('VALIDATION.REQUIRED');
    });

    test('名前が255文字を超えるとバリデーションエラーになること', () => {
      const nameCtrl = component.createFolderForm.get('name');
      nameCtrl?.setValue('a'.repeat(256));
      component.submitted.set(true);
      fixture.detectChanges();

      expect(component.isCreateFolderValid()).toBe(false);
      expect(component.folderNameError()).toBe('VALIDATION.MAX_LENGTH');
    });

    test('正しい値を入力するとバリデーションが通ること', () => {
      component.createFolderForm.patchValue({
        name: 'New Folder',
        server: 'LOCAL',
        endpointId: 'ep-local-1',
        fetchId: 'fetch-1',
        deleteId: 'delete-1',
        learnId: 'learn-1',
      });
      fixture.detectChanges();
      expect(component.isCreateFolderValid()).toBe(true);
    });

    test('作成ボタンクリックでstore.createFolderが呼ばれること', async () => {
      component.createFolderForm.patchValue({
        name: 'New Folder',
        server: 'LOCAL',
        description: 'New Desc',
        endpointId: 'ep-local-1',
        fetchId: 'fetch-1',
        deleteId: 'delete-1',
        learnId: 'learn-1',
      });
      fixture.detectChanges();

      await component.submitCreateFolder();
      expect(mockStore.createFolder).toHaveBeenCalledWith({
        name: 'New Folder',
        type: 'LOCAL',
        description: 'New Desc',
        get: 'fetch-1',
        delete: 'delete-1',
        add: 'learn-1',
        endpointIds: ['ep-local-1'],
        groupIds: ['group-1'],
      });
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('ローカル接続でサービスIDを入力しないと作成できないこと', async () => {
      component.createFolderForm.patchValue({
        name: 'New Folder',
        server: 'LOCAL',
        endpointId: 'ep-local-1',
      });
      fixture.detectChanges();

      await component.submitCreateFolder();

      expect(mockStore.createFolder).not.toHaveBeenCalled();
      expect(component.fetchIdError()).toBe('VALIDATION.REQUIRED');
      expect(component.deleteIdError()).toBe('VALIDATION.REQUIRED');
      expect(component.learnIdError()).toBe('VALIDATION.REQUIRED');
    });

    test('ローカル接続でサービスIDが未入力でも作成ボタンが押せる状態であること', () => {
      component.createFolderForm.patchValue({
        name: 'New Folder',
        server: 'LOCAL',
        endpointId: 'ep-local-1',
      });
      fixture.detectChanges();

      expect(component.canSubmitCreateFolder()).toBe(true);
    });

    test('クラウド接続ではサービスIDが未入力でも作成できること', async () => {
      folderModalSelectedEndpointIds.set(['ep-1', 'ep-2']);
      component.createFolderForm.patchValue({
        name: 'New Folder',
        server: 'SAAS_GLOBAL',
      });
      fixture.detectChanges();

      await component.submitCreateFolder();

      expect(mockStore.createFolder).toHaveBeenCalled();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });
  });
});
