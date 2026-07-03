import { Component, forwardRef, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { AdminUserListComponent } from './user-list.component';
import { UserListStore } from './stores/user-list.store';
import { UserListApiService } from './services/user-list-api.service';
import { UserListAuthService } from './services/user-list-auth.service';
import { ToastService } from '@core/services/toast.service';
import type { AdminUser } from '@app-types/admin/user.types';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Stubs ---------------
@Component({
  selector: 'app-admin-page-shell',
  standalone: true,
  template: '<ng-content></ng-content>',
})
class AdminPageShellStub {
  titleKey = input<string>('');
}

@Component({ selector: 'app-button', standalone: true, template: '<ng-content></ng-content>' })
class ButtonStub {
  variant = input<string>('solid');
  intent = input<string>('primary');
  size = input<string>('md');
  type = input<string>('button');
  fullWidth = input<boolean>(false);
  disabled = input<boolean>(false);
  loading = input<boolean>(false);
  buttonClick = output<void>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  totalPages = input<number>(1);
  useQueryParams = input<boolean>(false);
  showPageSize = input<boolean>(false);
  showPageNumbers = input<boolean>(false);
  showFirstLast = input<boolean>(false);
  currentPageOverride = input<number>(1);
  countDisplay = input<string>('');
  pageChange = output<number>();
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  options = input<any[]>([]);
  value = input<any>();
  placeholder = input<string>('');
  size = input<string>('md');
  valueChange = output<any>();
}

@Component({ selector: 'app-user-list-menu', standalone: true, template: '' })
class UserListMenuStub {
  item = input.required<AdminUser>();
  editUser = output<AdminUser>();
  deleteUser = output<void>();
}

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  placeholder = input<string>('');
  size = input<string>('md');
  value = input<string>('');
  valueChange = output<string>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  fields = input<any[]>([]);
  selectedField = input<any>();
  selectedOrder = input<any>('desc');
  placeholder = input<string>('');
  size = input<string>('md');
  selectedFieldChange = output<any>();
  selectedOrderChange = output<any>();
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  name = input<string>('');
}

@Component({ selector: 'app-table-list', standalone: true, template: '<ng-content></ng-content>' })
class TableListStub {}

@Component({
  selector: 'app-table-list-item',
  standalone: true,
  template: '<ng-content slot="right"></ng-content><ng-content></ng-content>',
})
class TableListItemStub {
  isHeader = input<boolean>(false);
  showCheckbox = input<boolean>(false);
  checked = input<boolean>(false);
  indeterminate = input<boolean>(false);
  checkedChange = output<boolean>();
}

@Component({ selector: 'app-user-add-dialog', standalone: true, template: '' })
class UserAddDialogStub {
  formGroup = input.required<any>();
}

@Component({ selector: 'app-user-edit-dialog', standalone: true, template: '' })
class UserEditDialogStub {
  formGroup = input.required<any>();
}

@Component({ selector: 'app-user-password-reveal-dialog', standalone: true, template: '' })
class UserPasswordRevealDialogStub {
  initialPassword = input.required<string>();
  passwordExpiredAt = input.required<string>();
}

@Component({
  selector: 'app-dialog',
  standalone: true,
  template: '',
})
class DialogStub {}

// --------------- Mocks ---------------
const initialItems: AdminUser[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'login_one',
    displayName: 'User One',
    role: 'admin',
    totalCredits: 1000,
    loginKey: 'key-1',
    accountType: 'none',
    email: '',
    updatedAt: new Date(),
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'login_two',
    displayName: 'User Two',
    role: 'user',
    totalCredits: 2000,
    loginKey: 'key-2',
    accountType: 'none',
    email: '',
    updatedAt: new Date(),
  },
];

const mockItems = signal<AdminUser[]>([...initialItems]);

const mockStore = {
  items: mockItems,
  totalItems: signal(2),
  totalPages: signal(1),
  isLoading: signal(false),
  filter: signal({
    pageSize: 10,
    pageIndex: 1,
    sortField: 'name',
    sortOrder: 'asc',
    query: '',
  }),
  selectedIds: signal(new Set<string>()),
  selectedCount: signal(0),
  allSelected: signal(false),
  someSelected: signal(false),
  pageRange: signal({ from: 1, to: 2, total: 2 }),
  loadItems: vi.fn(),
  resetFilterAndLoad: vi.fn(),
  updateFilter: vi.fn(),
  updatePageIndex: vi.fn(),
  updatePageSize: vi.fn(),
  toggleSelected: vi.fn(),
  toggleSelectAll: vi.fn(),
  clearSelection: vi.fn(),
  addOne: vi.fn(),
  updateOne: vi.fn(),
  removeMany: vi.fn(),
};

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

const mockUserApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteOne: vi.fn(),
};

const mockUserListAuth = {
  ensureReady: vi.fn().mockResolvedValue(true),
  syncSessionFromAuthStore: vi.fn(),
  repairTenantIdInStorage: vi.fn().mockReturnValue('mock-tenant'),
  getRequestHeaders: vi.fn().mockReturnValue({ 'X-Tenant-ID': 'mock-tenant' }),
  isAuthenticated: vi.fn().mockReturnValue(true),
};

const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
};

const mockDialogRef = {
  afterClosed: vi.fn(() => of(true)),
  close: vi.fn(),
  componentInstance: {
    data: {
      confirmAction: null as any,
    },
  },
};

const mockDialog = {
  open: vi.fn(() => mockDialogRef),
};

describe('AdminUserListComponent', () => {
  let component: AdminUserListComponent;
  let fixture: ComponentFixture<AdminUserListComponent>;

  beforeEach(async () => {
    // Reset signals
    mockItems.set([...initialItems]);
    mockStore.totalItems.set(2);
    mockStore.isLoading.set(false);
    mockStore.filter.set({
      pageSize: 10,
      pageIndex: 1,
      sortField: 'name',
      sortOrder: 'asc',
      query: '',
    });
    mockStore.someSelected.set(false);

    await TestBed.configureTestingModule({
      imports: [AdminUserListComponent, NoopAnimationsModule, ReactiveFormsModule],
      providers: [
        { provide: UserListStore, useValue: mockStore },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: UserListApiService, useValue: mockUserApi },
        { provide: UserListAuthService, useValue: mockUserListAuth },
        { provide: ToastService, useValue: mockToast },
        { provide: MatDialog, useValue: mockDialog },
      ],
    })
      .overrideComponent(AdminUserListComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            AdminPageShellStub,
            ButtonStub,
            PaginationStub,
            SelectStub,
            UserListMenuStub,
            SearchInputStub,
            FormSortInputStub,
            SvgIconStub,
            TableListStub,
            TableListItemStub,
            UserAddDialogStub,
            UserEditDialogStub,
            UserPasswordRevealDialogStub,
            MatIconModule,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminUserListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期値・ゲッター', () => {
    test('初期化時に認証復元後loadItemsが呼ばれること', async () => {
      await fixture.whenStable();
      expect(mockUserListAuth.ensureReady).toHaveBeenCalled();
      expect(mockStore.loadItems).toHaveBeenCalled();
    });

    test('formatCreditsが数値をカンマ区切りで返すこと', () => {
      expect(component.formatCredits(1234567)).toBe('1,234,567');
      expect(component.formatCredits(0)).toBe('0');
    });

    test('admin指定時にADMIN.USER_MANAGEMENT.ROLE_ADMINの翻訳キーを呼び出すこと', () => {
      component.getRoleDisplay('admin');
      expect(mockTranslate.instant).toHaveBeenCalledWith('ADMIN.USER_MANAGEMENT.ROLE_ADMIN');
    });

    test('user指定時にADMIN.USER_MANAGEMENT.ROLE_GENERALの翻訳キーを呼び出すこと', () => {
      component.getRoleDisplay('user');
      expect(mockTranslate.instant).toHaveBeenCalledWith('ADMIN.USER_MANAGEMENT.ROLE_GENERAL');
    });

    test('system指定時にADMIN.USER_MANAGEMENT.ROLE_GENERALの翻訳キーを呼び出すこと', () => {
      component.getRoleDisplay('system');
      expect(mockTranslate.instant).toHaveBeenCalledWith('ADMIN.USER_MANAGEMENT.ROLE_GENERAL');
    });
  });

  describe('DOM要素表示', () => {
    test('ユーザーリストが表示されること', () => {
      const items = fixture.debugElement.queryAll(By.directive(TableListItemStub));
      // 1 header (PC) + 1 header (Mobile) + 2 data rows = 4
      expect(items.length).toBe(4);
    });

    test('読み込み中にローディングアイコンが表示されること', () => {
      mockStore.isLoading.set(true);
      fixture.detectChanges();
      const loadingIcon = fixture.debugElement.query(By.css('.animate-spin'));
      expect(loadingIcon).toBeTruthy();
    });

    test('データがない場合にメッセージが表示されること', () => {
      mockItems.set([]);
      fixture.detectChanges();
      const noData = fixture.debugElement.query(By.css('.text-center.text-text-muted'));
      expect(noData.nativeElement.textContent).toContain('ADMIN.USER_MANAGEMENT.NO_DATA');
    });

    test('選択中であればアクションバーが表示されること', () => {
      mockStore.someSelected.set(true);
      fixture.detectChanges();
      const deleteBtn = fixture.debugElement.query(By.css('app-button[intent="delete"]'));
      expect(deleteBtn).toBeTruthy();
    });

    test('ログインキー列のラベルが表示されること', () => {
      const labels = fixture.debugElement.queryAll(By.css('.table-list-label'));
      const loginKeyLabel = labels.find(
        (el) => el.nativeElement.textContent.trim() === 'ADMIN_CONSOLE.LOGIN_KEY',
      );
      expect(loginKeyLabel).toBeTruthy();
    });

    test('loginKeyが設定されているユーザーはマスク表示されること', () => {
      const maskedValues = fixture.debugElement.queryAll(By.css('.table-list-date.flex-1.w-20'));
      expect(maskedValues.length).toBeGreaterThan(0);
      maskedValues.forEach((el) => {
        expect(el.nativeElement.textContent.trim()).toBe('******');
      });
    });

    test('loginKeyが未設定のユーザーは「-」が表示されること', () => {
      mockItems.set([
        {
          id: '33333333-3333-4333-8333-333333333333',
          userId: 'login_three',
          displayName: 'User Three',
          role: 'user',
          totalCredits: 0,
          loginKey: '',
          accountType: 'none',
          email: '',
          updatedAt: new Date(),
        },
      ]);
      fixture.detectChanges();
      const cell = fixture.debugElement.query(By.css('.table-list-date.flex-1.w-20'));
      expect(cell.nativeElement.textContent.trim()).toBe('-');
    });
  });

  describe('DOM要素イベント', () => {
    test('検索入力が変更されたときupdateFilterが呼ばれること', () => {
      const searchInput = fixture.debugElement.query(By.directive(SearchInputStub));
      searchInput.componentInstance.valueChange.emit('test-query');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ query: 'test-query' });
    });

    test('役割フィルターが変更されたときupdateFilterが呼ばれること', () => {
      const select = fixture.debugElement.query(By.directive(SelectStub));
      select.componentInstance.valueChange.emit('admin');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({ role: 'admin' });
    });

    test('ソートが変更されたときupdateFilterが呼ばれること', () => {
      const sortInput = fixture.debugElement.query(By.directive(FormSortInputStub));
      sortInput.componentInstance.selectedFieldChange.emit('displayName');
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        sortField: 'displayName',
        sortOrder: 'asc', // default from store signal
      });
    });

    test('ページネーションでページが変更されたときupdatePageIndexが呼ばれること', () => {
      const pagination = fixture.debugElement.queryAll(By.directive(PaginationStub))[0];
      pagination.componentInstance.pageChange.emit(2);
      expect(mockStore.updatePageIndex).toHaveBeenCalledWith(2);
    });

    test('新規作成ボタンをクリックするとユーザー作成フォームが表示されること', () => {
      component.onAddUser();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ユーザー編集ダイアログが開かれること', () => {
      const user = initialItems[0];
      component.onEditUser(user);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('ユーザー削除ダイアログが開かれること', () => {
      component.onDeleteUser(initialItems[0]);
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });

  describe('ユーザー作成', () => {
    const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const FIXTURE_CREATE_RESPONSE = {
      id: 'new-id',
      loginId: 'new-user',
      name: 'New User',
      role: 'USER' as const,
      loginKey: '*****',
      isRequiredPasswordReset: true,
      initialPassword: 'TestPass123!',
      passwordExpiredAt: '2025-03-01T09:00:00.000Z',
    };

    test('ユーザーを新規作成できること', async () => {
      mockUserApi.create.mockResolvedValue(FIXTURE_CREATE_RESPONSE);
      mockStore.resetFilterAndLoad.mockResolvedValue(undefined);

      component.onAddUser();
      component.addForm.setValue({
        displayName: 'New User',
        userId: 'new-user',
        loginKey: '',
        role: 'user',
      });

      const confirmAction = mockDialogRef.componentInstance.data.confirmAction as () => void;
      confirmAction();
      await flushMicrotasks();

      expect(mockUserApi.create).toHaveBeenCalled();
      expect(mockStore.resetFilterAndLoad).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });

    test('作成後に初期パスワードが表示されること', async () => {
      mockUserApi.create.mockResolvedValue(FIXTURE_CREATE_RESPONSE);
      mockStore.resetFilterAndLoad.mockResolvedValue(undefined);

      component.onAddUser();
      component.addForm.setValue({
        displayName: 'New User',
        userId: 'new-user',
        loginKey: '',
        role: 'user',
      });

      const confirmAction = mockDialogRef.componentInstance.data.confirmAction as () => void;
      confirmAction();
      await flushMicrotasks();

      // 作成モーダル + パスワード表示モーダルの2回openが呼ばれること
      expect(mockDialog.open).toHaveBeenCalledTimes(2);
    });
  });

  describe('ユーザー更新', () => {
    const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    const FIXTURE_UPDATE_WITH_RESET = {
      id: '11111111-1111-4111-8111-111111111111',
      loginId: 'login_one',
      name: 'User One',
      role: 'ADMIN' as const,
      loginKey: '*****',
      isRequiredPasswordReset: true,
      initialPassword: 'TestPass123!',
      passwordExpiredAt: '2025-03-01T09:00:00.000Z',
    };

    const FIXTURE_UPDATE_WITHOUT_RESET = {
      id: '11111111-1111-4111-8111-111111111111',
      loginId: 'login_one',
      name: 'User One',
      role: 'ADMIN' as const,
      loginKey: '*****',
      isRequiredPasswordReset: false,
      initialPassword: null,
      passwordExpiredAt: null,
    };

    test('ユーザー情報を更新できること', async () => {
      mockUserApi.update.mockResolvedValue(FIXTURE_UPDATE_WITHOUT_RESET);
      mockStore.loadItems.mockResolvedValue(undefined);

      component.onEditUser(initialItems[0]);
      component.editForm.patchValue({ displayName: 'Updated Name' });

      const confirmAction = mockDialogRef.componentInstance.data.confirmAction as () => void;
      confirmAction();
      await flushMicrotasks();

      expect(mockUserApi.update).toHaveBeenCalled();
      expect(mockStore.loadItems).toHaveBeenCalled();
      expect(mockToast.success).toHaveBeenCalled();
    });

    test('パスワードをリセットして更新すると初期パスワードが表示されること', async () => {
      mockUserApi.update.mockResolvedValue(FIXTURE_UPDATE_WITH_RESET);
      mockStore.loadItems.mockResolvedValue(undefined);

      component.onEditUser(initialItems[0]);
      component.editForm.patchValue({ resetPassword: true });

      const confirmAction = mockDialogRef.componentInstance.data.confirmAction as () => void;
      confirmAction();
      await flushMicrotasks();

      // 更新モーダル + パスワード表示モーダルの2回openが呼ばれること
      expect(mockDialog.open).toHaveBeenCalledTimes(2);
    });

    test('パスワードをリセットしないで更新すると初期パスワードが表示されないこと', async () => {
      mockUserApi.update.mockResolvedValue(FIXTURE_UPDATE_WITHOUT_RESET);
      mockStore.loadItems.mockResolvedValue(undefined);

      component.onEditUser(initialItems[0]);
      // resetPassword はデフォルト false

      const confirmAction = mockDialogRef.componentInstance.data.confirmAction as () => void;
      confirmAction();
      await flushMicrotasks();

      // 更新モーダルの1回のみ
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });
  });
});
