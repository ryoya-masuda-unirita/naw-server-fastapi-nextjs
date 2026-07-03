import { CommonModule } from '@angular/common';
import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { AssistantCategoryApiItem } from '@app-types/admin/assistant.types';
import { ToastService } from '@core/services/toast.service';
import { TranslateService } from '@ngx-translate/core';
import { AssistantListApiService } from '../../services/assistant-list-api.service';
import { AssistantCategoryListStore } from '../../stores/assistant-category-list.store';
import { CategoryTabComponent } from './category-tab.component';

@Pipe({ name: 'translate', standalone: true })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({
  selector: 'app-button',
  standalone: true,
  template: '<button (click)="buttonClick.emit()"><ng-content></ng-content></button>',
})
class ButtonStub {
  variant = input<string>();
  intent = input<string>();
  size = input<string>();
  heightPx = input<number>();
  fullWidth = input<boolean>();
  iconPosition = input<string>();
  buttonClick = output<void>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  showPageSize = input<boolean>();
  showPageNumbers = input<boolean>();
  countDisplay = input<string>();
  totalPages = input<number>();
  currentPageOverride = input<number>();
  useQueryParams = input<boolean>();
  showFirstLast = input<boolean>();
  pageChange = output<number>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  size = input<string>();
  fields = input<any[]>();
  selectedField = input<string>();
  selectedOrder = input<string>();
  placeholder = input<string>();
  fieldChange = output<string | null>();
  orderChange = output<string>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  name = input<string>();
}

@Component({ selector: 'app-category-tab-menu', standalone: true, template: '' })
class CategoryTabMenuStub {
  item = input<any>();
  editCategory = output<any>();
  deleteCategory = output<any>();
}

@Component({
  selector: 'app-table-list',
  standalone: true,
  template: '<div><ng-content></ng-content></div>',
})
class TableListStub {}

@Component({
  selector: 'app-table-list-item',
  standalone: true,
  template: '<div (click)="checkedChange.emit(!checked())"><ng-content></ng-content></div>',
})
class TableListItemStub {
  isHeader = input<boolean>();
  showCheckbox = input<boolean>();
  checked = input<boolean>();
  indeterminate = input<boolean>();
  checkedChange = output<boolean>();
}

@Component({ selector: 'app-category-add-dialog', standalone: true, template: '' })
class CategoryAddDialogStub {
  formGroup = input<FormGroup>();
}

@Component({ selector: 'app-category-edit-dialog', standalone: true, template: '' })
class CategoryEditDialogStub {
  formGroup = input<FormGroup>();
}

describe('CategoryTabComponent', () => {
  let component: CategoryTabComponent;
  let fixture: ComponentFixture<CategoryTabComponent>;

  const mockItems = signal<AssistantCategoryApiItem[]>([
    { id: '1', name: 'Cat 1', description: 'Desc 1', updatedAt: '2024-01-01T00:00:00Z' } as any,
    { id: '2', name: 'Cat 2', description: 'Desc 2', updatedAt: '2024-01-02T00:00:00Z' } as any,
  ]);

  const mockStore = {
    items: mockItems,
    totalItems: signal(2),
    isLoading: signal(false),
    filter: signal({ pageIndex: 0, sortField: 'updatedAt', sortOrder: 'desc' }),
    totalPages: signal(1),
    countDisplay: signal('1-2件 / 2件'),
    loadItems: vi.fn(),
    updateFilter: vi.fn(),
    addOne: vi.fn(),
    updateOne: vi.fn(),
    removeMany: vi.fn(),
  };

  const mockTranslate = {
    instant: vi.fn((key: string) => key),
  };

  const mockRef = {
    close: vi.fn(),
    componentInstance: { data: { confirmAction: null as any } },
  };

  const mockDialog = {
    open: vi.fn().mockReturnValue(mockRef),
  };

  const mockApi = {
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    listCategories: vi.fn(),
  };

  const mockToast = {
    success: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryTabComponent, ReactiveFormsModule],
      providers: [
        { provide: AssistantCategoryListStore, useValue: mockStore },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: MatDialog, useValue: mockDialog },
        { provide: AssistantListApiService, useValue: mockApi },
        { provide: ToastService, useValue: mockToast },
      ],
    })
      .overrideComponent(CategoryTabComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            ButtonStub,
            PaginationStub,
            FormSortInputStub,
            SvgIconStub,
            CategoryTabMenuStub,
            TableListStub,
            TableListItemStub,
            CategoryAddDialogStub,
            CategoryEditDialogStub,
            ReactiveFormsModule,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CategoryTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
    component.selectedCategories.set([]);
    mockItems.set([
      { id: '1', name: 'Cat 1', description: 'Desc 1', updatedAt: '2024-01-01T00:00:00Z' } as any,
      { id: '2', name: 'Cat 2', description: 'Desc 2', updatedAt: '2024-01-02T00:00:00Z' } as any,
    ]);
  });

  describe('初期値・ゲッター', () => {
    test('初期化時に store.loadItems が呼ばれること', () => {
      expect(mockStore.loadItems).toHaveBeenCalled();
    });

    test('全選択の状態が正しく計算されること', () => {
      expect(component.allSelected()).toBe(false);
      component.selectedCategories.set([...mockItems()]);
      expect(component.allSelected()).toBe(true);
    });

    test('一部選択の状態が正しく計算されること', () => {
      expect(component.someSelected()).toBe(false);
      component.selectedCategories.set([mockItems()[0]]);
      expect(component.someSelected()).toBe(true);
    });
  });

  describe('DOM要素表示', () => {
    test('データがある場合、テーブル行が表示されること', () => {
      const rows = fixture.debugElement.queryAll(By.directive(TableListItemStub));
      // 2 header rows + 2 data rows = 4
      expect(rows.length).toBe(4);
    });

    test('データが空の場合、NO_DATA メッセージが表示されること', () => {
      mockItems.set([]);
      fixture.detectChanges();
      const noData = fixture.debugElement.query(By.css('.text-center'));
      expect(noData.nativeElement.textContent).toContain('ADMIN.ASSISTANT.CATEGORY_NO_DATA');
    });
  });

  describe('DOM要素イベント', () => {
    test('並べ替え変更時に、ソート条件が更新され一覧が再取得されること', () => {
      const sortInput = fixture.debugElement.query(
        By.directive(FormSortInputStub),
      ).componentInstance;
      sortInput.fieldChange.emit('name');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ sortField: 'name', sortOrder: 'desc' });
    });

    test('ページ送り時に、表示ページが更新され一覧が再取得されること', () => {
      const pagination = fixture.debugElement.query(By.directive(PaginationStub)).componentInstance;
      pagination.pageChange.emit(2);
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ pageIndex: 1 });
    });

    test('作成ボタンクリックでダイアログが開くこと', () => {
      component.onAddCategory();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('編集ボタンクリックでダイアログが開くこと', () => {
      component.onEditCategory(mockItems()[0]);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('削除ボタンクリックでダイアログが開くこと', () => {
      component.onDeleteCategory(mockItems()[0]);
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('アクション', () => {
    test('カテゴリ作成が成功すること', async () => {
      mockApi.createCategory.mockResolvedValue({ id: '3', name: 'New Cat' });

      component.onAddCategory();
      component.addForm.patchValue({ name: 'New Cat', description: 'Desc' });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.createCategory).toHaveBeenCalledWith({ name: 'New Cat', description: 'Desc' });
      expect(mockStore.addOne).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });

    test('カテゴリ編集が成功すること', async () => {
      mockApi.updateCategory.mockResolvedValue({ id: '1', name: 'Updated Cat' });

      component.onEditCategory(mockItems()[0]);
      component.editForm.patchValue({ name: 'Updated Cat' });

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.updateCategory).toHaveBeenCalledWith('1', {
        name: 'Updated Cat',
        description: 'Desc 1',
      });
      expect(mockStore.updateOne).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });

    test('カテゴリ削除が成功すること', async () => {
      mockApi.deleteCategory.mockResolvedValue({});

      component.onDeleteCategory(mockItems()[0]);

      await mockRef.componentInstance.data.confirmAction();

      expect(mockApi.deleteCategory).toHaveBeenCalledWith('1');
      expect(mockStore.removeMany).toHaveBeenCalledWith(['1']);
      expect(mockToast.success).toHaveBeenCalled();
      expect(mockRef.close).toHaveBeenCalled();
    });
  });
});
