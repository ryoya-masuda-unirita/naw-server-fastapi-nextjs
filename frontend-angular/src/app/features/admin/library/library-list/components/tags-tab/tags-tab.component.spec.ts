/* eslint-disable @angular-eslint/component-selector */
import { Component, input, model, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { DatePipe } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { TagItem } from '@app-types/admin/library.types';
import { ToastService } from '@core/services/toast.service';
import { TagsTabComponent } from './tags-tab.component';
import { TagsStore } from './tags.store';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Stubs ---------------
@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly size = input<string>('md');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly heightPx = input<number | undefined>(undefined);
  readonly intent = input<string | undefined>(undefined);
  readonly iconPosition = input<string | undefined>(undefined);
  readonly buttonClick = output<void>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input.required<number>();
  readonly useQueryParams = input<boolean>(true);
  readonly showPageSize = input<boolean>(true);
  readonly showPageNumbers = input<boolean>(true);
  readonly showFirstLast = input<boolean>(true);
  readonly countDisplay = input<string>('');
  readonly currentPageOverride = input<number | null>(null);
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-table-list', standalone: true, template: '<ng-content />' })
class TableListStub {}

@Component({
  selector: 'app-table-list-item',
  standalone: true,
  template: '<ng-content /><ng-content select="[slot=right]" />',
})
class TableListItemStub {
  readonly isHeader = input<boolean>(false);
  readonly showCheckbox = input<boolean>(false);
  readonly checked = input<boolean>(false);
  readonly indeterminate = input<boolean>(false);
  readonly checkedChange = output<boolean>();
}

@Component({ selector: 'app-tag-item-menu', standalone: true, template: '' })
class TagItemMenuStub {
  readonly item = input.required<TagItem>();
  readonly editSettings = output<TagItem>();
  readonly deleteItem = output<TagItem>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly placeholder = input<string>('');
  readonly size = input<string>('md');
  readonly fields = input<unknown[]>([]);
  readonly selectedField = model<string | null>(null);
  readonly selectedOrder = model<string | null>(null);
  readonly fieldChange = output<string | null>();
  readonly orderChange = output<string | null>();
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class AppMatIconStub {
  readonly icon = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'mat-icon', standalone: true, template: '' })
class MatIconStub {}

@Component({ selector: 'app-skeleton', standalone: true, template: '' })
class SkeletonStub {
  readonly variant = input<string>('rect');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly rounded = input<string>('rounded');
}

// --------------- フィクスチャデータ ---------------
const FIXTURE_TAG: TagItem = {
  id: '1',
  name: 'タグA',
  description: '説明A',
  updatedAt: '2025-09-29T20:05:00.000Z',
};

const FIXTURE_TAGS: TagItem[] = [
  FIXTURE_TAG,
  { id: '2', name: 'タグB', updatedAt: '2025-09-28T00:00:00.000Z' },
  { id: '3', name: 'タグC', description: '説明C', updatedAt: '2025-09-27T00:00:00.000Z' },
];

// --------------- Store モック ---------------
function createMockStore() {
  const itemsSignal = signal<TagItem[]>([]);
  const isLoadingSignal = signal(false);
  const totalElementsSignal = signal(0);
  const currentPageSignal = signal(1);
  const pageSizeSignal = signal(25);
  const sortBySignal = signal('');
  const sortOrderSignal = signal('desc');
  const totalPagesSignal = signal(1);
  const countDisplaySignal = signal('0件');

  return {
    items: itemsSignal,
    isLoading: isLoadingSignal,
    totalElements: totalElementsSignal,
    currentPage: currentPageSignal,
    pageSize: pageSizeSignal,
    sortBy: sortBySignal,
    sortOrder: sortOrderSignal,
    totalPages: totalPagesSignal,
    countDisplay: countDisplaySignal,
    loadTags: vi.fn().mockResolvedValue(undefined),
    changePage: vi.fn().mockResolvedValue(undefined),
    changeSort: vi.fn().mockResolvedValue(undefined),
    changeSortOrder: vi.fn().mockResolvedValue(undefined),
    createTag: vi.fn().mockResolvedValue(true),
    updateTag: vi.fn().mockResolvedValue(true),
    deleteTag: vi.fn().mockResolvedValue(undefined),
    deleteTags: vi.fn().mockResolvedValue(undefined),
  };
}

const mockDialog = {
  open: vi.fn(),
  closeAll: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

// ================================================================
describe('TagsTabComponent', () => {
  let fixture: ComponentFixture<TagsTabComponent>;
  let component: TagsTabComponent;
  let mockStore: ReturnType<typeof createMockStore>;

  beforeEach(async () => {
    mockStore = createMockStore();
    mockTranslate.instant.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [TagsTabComponent, NoopAnimationsModule],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: ToastService, useValue: mockToast },
        { provide: TagsStore, useValue: mockStore },
      ],
    })
      .overrideComponent(TagsTabComponent, {
        set: {
          imports: [
            DatePipe,
            FakeTranslatePipe,
            MatIconStub,
            ButtonStub,
            PaginationStub,
            TableListStub,
            TableListItemStub,
            TagItemMenuStub,
            FormSortInputStub,
            AppMatIconStub,
            SvgIconStub,
            SkeletonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TagsTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ================================================================
  describe('初期表示', () => {
    test('初期化時にタグ一覧がロードされること', () => {
      expect(mockStore.loadTags).toHaveBeenCalledOnce();
    });

    test('初期状態で選択アイテムが0件であること', () => {
      expect(component.selectedTags()).toEqual([]);
    });

    test('初期状態でisCreateModeがfalseであること', () => {
      expect(component.isCreateMode()).toBe(false);
    });

    test('初期状態でisFormValidがfalseであること', () => {
      expect(component.isFormValid()).toBe(false);
    });

    test('sortOptionsが「更新日時」「名前」の2件であること', () => {
      expect(component.sortOptions.length).toBe(2);
      expect(component.sortOptions[0].value).toBe('updatedAt');
      expect(component.sortOptions[1].value).toBe('name');
    });

    test('タグが0件のときデータなし表示が出ること', () => {
      mockStore.items.set([]);
      fixture.detectChanges();
      const noDataEl = fixture.debugElement.query(By.css('.text-text-muted'));
      expect(noDataEl).toBeTruthy();
    });

    test('ロード中はスケルトンが表示されること', () => {
      mockStore.isLoading.set(true);
      fixture.detectChanges();
      const skeletons = fixture.debugElement.queryAll(By.css('app-skeleton'));
      expect(skeletons.length).toBeGreaterThan(0);
    });

    test('タグがあるときタグ行が表示されること', () => {
      mockStore.items.set(FIXTURE_TAGS);
      fixture.detectChanges();
      const menus = fixture.debugElement.queryAll(By.css('app-tag-item-menu'));
      expect(menus.length).toBe(FIXTURE_TAGS.length);
    });
  });

  // ================================================================
  describe('選択操作', () => {
    beforeEach(() => {
      mockStore.items.set(FIXTURE_TAGS);
      fixture.detectChanges();
    });

    test('個別選択できること', () => {
      component.toggleItemSelection(FIXTURE_TAG, true);
      expect(component.isTagSelected(FIXTURE_TAG)).toBe(true);
    });

    test('個別選択解除できること', () => {
      component.toggleItemSelection(FIXTURE_TAG, true);
      component.toggleItemSelection(FIXTURE_TAG, false);
      expect(component.isTagSelected(FIXTURE_TAG)).toBe(false);
    });

    test('全選択できること', () => {
      component.toggleAllSelection(true);
      expect(component.allSelected()).toBe(true);
    });

    test('全選択解除できること', () => {
      component.toggleAllSelection(true);
      component.toggleAllSelection(false);
      expect(component.selectedTags()).toEqual([]);
    });

    test('一部選択のときsomeSelectedがtrueになること', () => {
      component.toggleItemSelection(FIXTURE_TAGS[0], true);
      expect(component.someSelected()).toBe(true);
    });

    test('選択解除ボタンで全解除されること', () => {
      component.toggleAllSelection(true);
      component.onDeselectAll();
      expect(component.selectedTags()).toEqual([]);
    });
  });

  // ================================================================
  describe('ページネーション', () => {
    test('ページ変更でstore.changePageが呼ばれること', () => {
      component.onPageChange(2);
      expect(mockStore.changePage).toHaveBeenCalledWith(2);
    });

    test('ページ変更で選択が解除されること', () => {
      mockStore.items.set(FIXTURE_TAGS);
      component.toggleAllSelection(true);
      component.onPageChange(2);
      expect(component.selectedTags()).toEqual([]);
    });
  });

  // ================================================================
  describe('ソート', () => {
    test('ソート変更でstore.changeSortが呼ばれること', () => {
      component.onSortChange('name');
      expect(mockStore.changeSort).toHaveBeenCalledWith('name');
    });

    test('ソート変更で選択が解除されること', () => {
      mockStore.items.set(FIXTURE_TAGS);
      component.toggleAllSelection(true);
      component.onSortChange('name');
      expect(component.selectedTags()).toEqual([]);
    });

    test('sortByがnullのときstore.changeSortに空文字が渡ること', () => {
      component.onSortChange(null);
      expect(mockStore.changeSort).toHaveBeenCalledWith('');
    });
  });

  // ================================================================
  describe('タグ作成ダイアログ', () => {
    test('作成ダイアログを開けること', () => {
      component.onCreateTag();
      expect(mockDialog.open).toHaveBeenCalledOnce();
    });

    test('ダイアログを開くとisCreateModeがtrueになること', () => {
      component.onCreateTag();
      expect(component.isCreateMode()).toBe(true);
    });

    test('ダイアログを開くとisFormValidがfalseにリセットされること', () => {
      (component as unknown as { formValid: ReturnType<typeof signal<boolean>> }).formValid.set(
        true,
      );
      component.onCreateTag();
      expect(component.isFormValid()).toBe(false);
    });

    test('closeEditTagDialogでダイアログが閉じること', () => {
      component.closeEditTagDialog();
      expect(mockDialog.closeAll).toHaveBeenCalledOnce();
    });

    test('saveEditTagで新規作成成功時にstore.createTagが呼ばれダイアログが閉じること', async () => {
      component.onCreateTag();
      (
        component as unknown as {
          formValues: ReturnType<typeof signal<{ name: string; description: string }>>;
        }
      ).formValues.set({ name: '新タグ', description: '' });
      await component.saveEditTag();
      expect(mockStore.createTag).toHaveBeenCalledWith({ name: '新タグ', description: undefined });
      expect(mockDialog.closeAll).toHaveBeenCalledOnce();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    test('saveEditTagで新規作成失敗時に作成失敗トーストを表示しダイアログを閉じないこと', async () => {
      mockStore.createTag.mockResolvedValueOnce(false);
      component.onCreateTag();
      (
        component as unknown as {
          formValues: ReturnType<typeof signal<{ name: string; description: string }>>;
        }
      ).formValues.set({ name: '新タグ', description: '' });
      await component.saveEditTag();
      expect(mockToast.error).toHaveBeenCalledWith('ADMIN.LIBRARY.TAGS.CREATE_FAILED');
      expect(mockDialog.closeAll).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  describe('タグ編集ダイアログ', () => {
    test('編集ダイアログを開けること', () => {
      component.onEditSettings(FIXTURE_TAG);
      expect(mockDialog.open).toHaveBeenCalledOnce();
    });

    test('ダイアログを開くとisCreateModeがfalseになること', () => {
      component.isCreateMode.set(true);
      component.onEditSettings(FIXTURE_TAG);
      expect(component.isCreateMode()).toBe(false);
    });

    test('saveEditTagで編集成功時にstore.updateTagが呼ばれダイアログが閉じること', async () => {
      component.onEditSettings(FIXTURE_TAG);
      (
        component as unknown as {
          formValues: ReturnType<typeof signal<{ name: string; description: string }>>;
        }
      ).formValues.set({ name: '編集タグ', description: '新説明' });
      await component.saveEditTag();
      expect(mockStore.updateTag).toHaveBeenCalledWith(FIXTURE_TAG.id, {
        name: '編集タグ',
        description: '新説明',
      });
      expect(mockDialog.closeAll).toHaveBeenCalledOnce();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    test('saveEditTagで編集失敗時に更新失敗トーストを表示しダイアログを閉じないこと', async () => {
      mockStore.updateTag.mockResolvedValueOnce(false);
      component.onEditSettings(FIXTURE_TAG);
      (
        component as unknown as {
          formValues: ReturnType<typeof signal<{ name: string; description: string }>>;
        }
      ).formValues.set({ name: '編集タグ', description: '新説明' });
      await component.saveEditTag();
      expect(mockToast.error).toHaveBeenCalledWith('ADMIN.LIBRARY.TAGS.UPDATE_FAILED');
      expect(mockDialog.closeAll).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  describe('タグ削除ダイアログ', () => {
    test('削除確認ダイアログを開けること', () => {
      component.onDeleteTag(FIXTURE_TAG);
      expect(mockDialog.open).toHaveBeenCalledOnce();
    });

    test('複数選択した状態でまとめて削除できること', () => {
      component.onDeleteTags(FIXTURE_TAGS);
      expect(mockDialog.open).toHaveBeenCalledOnce();
    });
  });
});
