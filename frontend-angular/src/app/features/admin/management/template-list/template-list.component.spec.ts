import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';

import { ToastService } from '@core/services/toast.service';
import { AdminTemplate } from '@app-types/admin/template.types';
import { SelectOption } from '@app-types/common';

import { AdminTemplateListComponent } from './template-list.component';
import { TemplateListStore } from './stores/template-list.store';
import { TemplateListApiService } from './services/template-list-api.service';
import { GroupsApiService } from './services/groups-api.service';
import { TemplateFilterChange } from './components/template-list-filter/template-list-filter.component';
import { GroupTemplatesApiService } from '../group-list/services/group-templates-api.service';

// ─── Fake translate pipe / service ───────────────────────────────────────────
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const langChange$ = new Subject<{ lang: string }>();
const mockTranslateService = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  currentLang: 'ja',
  onLangChange: langChange$.asObservable(),
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

// ─── Mock TemplateListStore (signal-based) ───────────────────────────────────
const filterSignal = signal({
  pageSize: 10,
  pageIndex: 1,
  sortField: 'updatedAt' as const,
  sortOrder: 'desc' as const,
});
const totalItemsSignal = signal(0);
const totalPagesSignal = signal(1);
const pageRangeSignal = signal({ from: 0, to: 0, total: 0 });
const isLoadingSignal = signal(false);
const itemsSignal = signal<AdminTemplate[]>([]);
const selectedIdsSignal = signal<ReadonlySet<string>>(new Set());
const allSelectedSignal = signal(false);
const someSelectedSignal = signal(false);
const selectedCountSignal = signal(0);

const mockStore = {
  loadItems: vi.fn(),
  updateFilter: vi.fn(),
  updatePageSize: vi.fn(),
  updatePageIndex: vi.fn(),
  toggleSelected: vi.fn(),
  toggleSelectAll: vi.fn(),
  clearSelection: vi.fn(),
  removeMany: vi.fn(),
  addOne: vi.fn(),
  updateOne: vi.fn(),
  filter: filterSignal,
  totalItems: totalItemsSignal,
  totalPages: totalPagesSignal,
  pageRange: pageRangeSignal,
  isLoading: isLoadingSignal,
  items: itemsSignal,
  selectedIds: selectedIdsSignal,
  allSelected: allSelectedSignal,
  someSelected: someSelectedSignal,
  selectedCount: selectedCountSignal,
};

// ─── Mock services ───────────────────────────────────────────────────────────
const mockGroupsApi: { list: ReturnType<typeof vi.fn> } = {
  list: vi.fn(),
};
const mockTemplateApi = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteOne: vi.fn(),
};
const mockGroupTemplatesApi = {
  addTemplates: vi.fn(),
  remove: vi.fn(),
};
const mockToast = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
};

// ─── Mock MatDialog ──────────────────────────────────────────────────────────
interface FakeDialogRef {
  componentInstance: { data: Record<string, unknown> };
  close: ReturnType<typeof vi.fn>;
  afterClosed: () => { subscribe: (cb: (v: unknown) => void) => { unsubscribe: () => void } };
}

const dialogRefs: FakeDialogRef[] = [];
const mockDialog = {
  open: vi.fn().mockImplementation((_cmp: unknown, config: { data: Record<string, unknown> }) => {
    const ref: FakeDialogRef = {
      componentInstance: { data: { ...config.data } },
      close: vi.fn(),
      afterClosed: () => ({
        subscribe: () => ({ unsubscribe: () => undefined }),
      }),
    };
    dialogRefs.push(ref);
    return ref;
  }),
};

// ─── Stub child components ───────────────────────────────────────────────────
@Component({ selector: 'app-admin-page-shell', standalone: true, template: '<ng-content />' })
class AdminPageShellStub {
  readonly title = input<string>('');
  readonly titleKey = input<string>('');
  readonly mainClass = input<string>('');
  readonly showSidebarToggle = input<boolean>(true);
  readonly showActions = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(true);
  readonly showBackButton = input<boolean>(false);
  readonly customHeader = input<boolean>(false);
}

@Component({ selector: 'app-template-list-filter', standalone: true, template: '' })
class TemplateListFilterStub {
  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');
  readonly teams = input<string[]>([]);
  readonly pageIndexChange = output<number>();
  readonly filterChange = output<TemplateFilterChange>();
}

@Component({ selector: 'app-template-list-items', standalone: true, template: '' })
class TemplateListItemsStub {
  readonly items = input.required<AdminTemplate[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly allSelected = input<boolean>(false);
  readonly someSelected = input<boolean>(false);
  readonly openMenuId = input<string | null>(null);
  readonly selectAllChange = output<boolean>();
  readonly itemSelectChange = output<{ id: string; checked: boolean }>();
  readonly toggleMenu = output<string>();
  readonly editTemplate = output<AdminTemplate>();
  readonly deleteTemplate = output<AdminTemplate>();
}

@Component({ selector: 'app-template-form', standalone: true, template: '' })
class TemplateFormStub {
  readonly formGroup = input.required<FormGroup>();
  readonly teamOptions = input<SelectOption[]>([]);
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

@Component({ selector: 'app-button', standalone: true, template: '<ng-content />' })
class ButtonStub {
  readonly variant = input<string>('solid');
  readonly intent = input<string>('default');
  readonly size = input<string>('md');
  readonly type = input<string>('button');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly heightPx = input<number | undefined>(undefined);
  readonly classProps = input<string | undefined>('');
  readonly iconPosition = input<'left' | 'right'>('right');
  readonly buttonClick = output<MouseEvent>();
}

@Component({ selector: 'app-icon-button', standalone: true, template: '<ng-content />' })
class IconButtonStub {
  readonly variant = input<string>('primary');
  readonly size = input<string>('default');
  readonly type = input<string>('button');
  readonly disabled = input<boolean>(false);
  readonly link = input<string>('');
  readonly ariaLabel = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input.required<string>();
}

// Helper: flush microtasks (for async confirmAction handlers)
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ================================================================
describe('AdminTemplateListComponent', () => {
  let fixture: ComponentFixture<AdminTemplateListComponent>;
  let component: AdminTemplateListComponent;

  const resetState = () => {
    filterSignal.set({
      pageSize: 10,
      pageIndex: 1,
      sortField: 'updatedAt',
      sortOrder: 'desc',
    });
    totalItemsSignal.set(0);
    totalPagesSignal.set(1);
    pageRangeSignal.set({ from: 0, to: 0, total: 0 });
    isLoadingSignal.set(false);
    itemsSignal.set([]);
    selectedIdsSignal.set(new Set());
    allSelectedSignal.set(false);
    someSelectedSignal.set(false);
    selectedCountSignal.set(0);
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    dialogRefs.length = 0;
    resetState();
    mockTranslateService.instant.mockImplementation((key: string) => key);
    mockGroupsApi.list.mockResolvedValue([
      { id: '1', name: 'チームA' },
      { id: '2', name: 'チームB' },
    ]);

    await TestBed.configureTestingModule({
      imports: [AdminTemplateListComponent, NoopAnimationsModule],
      providers: [
        { provide: TemplateListStore, useValue: mockStore },
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: MatDialog, useValue: mockDialog },
        { provide: GroupsApiService, useValue: mockGroupsApi },
        { provide: GroupTemplatesApiService, useValue: mockGroupTemplatesApi },
        { provide: TemplateListApiService, useValue: mockTemplateApi },
        { provide: ToastService, useValue: mockToast },
      ],
    })
      .overrideComponent(AdminTemplateListComponent, {
        set: {
          imports: [
            FakeTranslatePipe,
            MatProgressSpinnerModule,
            AdminPageShellStub,
            TemplateListFilterStub,
            TemplateListItemsStub,
            TemplateFormStub,
            PaginationStub,
            ButtonStub,
            IconButtonStub,
            SvgIconStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminTemplateListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // Flush ngOnInit's loadGroups()
    await flushMicrotasks();
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ================================================================
  describe('初期表示', () => {
    test('件数が0のときページ範囲が表示されないこと', () => {
      pageRangeSignal.set({ from: 0, to: 0, total: 0 });
      expect(component.countDisplay()).toBe('');
    });

    test('件数があるとき現在のページ範囲が表示されること', () => {
      pageRangeSignal.set({ from: 1, to: 10, total: 25 });
      expect(component.countDisplay()).toBe('TEMPLATES.PAGE_COUNT');
      expect(mockTranslateService.instant).toHaveBeenCalledWith('TEMPLATES.PAGE_COUNT', {
        from: 1,
        to: 10,
        total: 25,
      });
    });

    test('画面を開くとテンプレート一覧とグループ一覧が読み込まれること', () => {
      expect(mockStore.loadItems).toHaveBeenCalledTimes(1);
      expect(mockGroupsApi.list).toHaveBeenCalledTimes(1);
    });

    test('グループ一覧がフィルターの選択肢に表示されること', () => {
      expect(component.teamSelectOptions).toEqual([
        { value: '1', label: 'チームA' },
        { value: '2', label: 'チームB' },
      ]);
    });

    test('グループ一覧の取得に失敗したときフィルター選択肢が空になること', async () => {
      vi.clearAllMocks();
      mockGroupsApi.list.mockRejectedValue(new Error('network error'));

      await (component as unknown as { loadGroups(): Promise<void> })['loadGroups']();

      expect(component.teamSelectOptions).toEqual([]);
      expect(component.teamFilterNames()).toEqual([]);
    });
  });

  // ================================================================
  describe('表示', () => {
    test('ページタイトルが表示されること', () => {
      const shell = fixture.debugElement.query(By.directive(AdminPageShellStub));
      expect(shell).toBeTruthy();
      expect(shell.componentInstance.titleKey()).toBe('TEMPLATES.TITLE');
    });

    test('未選択時に追加ボタンが表示されること', () => {
      someSelectedSignal.set(false);
      fixture.detectChanges();
      const buttons = fixture.debugElement.queryAll(By.directive(ButtonStub));
      // At least one button is rendered (the add button)
      expect(buttons.length).toBeGreaterThan(0);
    });

    test('選択中のとき選択解除/削除ボタンが表示されること', () => {
      someSelectedSignal.set(true);
      fixture.detectChanges();
      const buttons = fixture.debugElement.queryAll(By.directive(ButtonStub));
      // Two buttons in the action bar when selection mode
      expect(buttons.length).toBe(2);
    });

    test('読み込み中はスピナーが表示されること', () => {
      isLoadingSignal.set(true);
      fixture.detectChanges();
      const spinner = fixture.nativeElement.querySelector('mat-spinner');
      expect(spinner).toBeTruthy();
      const list = fixture.debugElement.query(By.directive(TemplateListItemsStub));
      expect(list).toBeFalsy();
    });

    test('読み込み完了後にテンプレート一覧が表示されること', () => {
      const items: AdminTemplate[] = [
        { id: '1', name: 'A', description: 'd', systemPrompt: 'p', teams: ['チームA'] },
      ];
      itemsSignal.set(items);
      isLoadingSignal.set(false);
      fixture.detectChanges();
      const list = fixture.debugElement.query(By.directive(TemplateListItemsStub));
      expect(list).toBeTruthy();
      expect(list.componentInstance.items()).toEqual(items);
    });

    test('テンプレートが存在する場合はページネーションが表示されること', () => {
      totalItemsSignal.set(20);
      totalPagesSignal.set(2);
      isLoadingSignal.set(false);
      fixture.detectChanges();
      const paginations = fixture.debugElement.queryAll(By.directive(PaginationStub));
      expect(paginations.length).toBe(1);
    });

    test('テンプレートが存在しない場合はページネーションが表示されないこと', () => {
      totalItemsSignal.set(0);
      fixture.detectChanges();
      const paginations = fixture.debugElement.queryAll(By.directive(PaginationStub));
      expect(paginations.length).toBe(0);
    });
  });

  // ================================================================
  describe('操作', () => {
    test('「全て」を選択するとグループフィルターが解除されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(TemplateListFilterStub));
      filterEl.componentInstance.filterChange.emit({
        query: 'foo',
        team: '__all__',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      expect(mockStore.updateFilter).toHaveBeenCalledWith({
        query: 'foo',
        team: undefined,
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
    });

    test('特定のグループを選択するとそのグループで絞り込まれること', () => {
      const filterEl = fixture.debugElement.query(By.directive(TemplateListFilterStub));
      filterEl.componentInstance.filterChange.emit({
        query: '',
        team: 'チームA',
        sortField: 'name',
        sortOrder: 'asc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      // フィルターはグループ名を送るが、コンポーネントがIDに変換してStoreに渡す
      expect(arg.team).toBe('1');
      expect(arg.query).toBeUndefined();
      expect(arg.sortField).toBe('name');
    });

    test('「所属なし」を選択するとグループ未所属で絞り込まれること', () => {
      const filterEl = fixture.debugElement.query(By.directive(TemplateListFilterStub));
      filterEl.componentInstance.filterChange.emit({
        query: '',
        team: '__none__',
        sortField: 'updatedAt',
        sortOrder: 'desc',
      });
      const arg = mockStore.updateFilter.mock.calls[0][0];
      expect(arg.team).toBe('__none__');
    });

    test('ページを切り替えると対応するページが表示されること', () => {
      const filterEl = fixture.debugElement.query(By.directive(TemplateListFilterStub));
      filterEl.componentInstance.pageIndexChange.emit(3);
      expect(mockStore.updatePageIndex).toHaveBeenCalledWith(3);
    });

    test('全選択チェックボックスで全テンプレートを選択・解除できること', () => {
      const list = fixture.debugElement.query(By.directive(TemplateListItemsStub));
      list.componentInstance.selectAllChange.emit(true);
      expect(mockStore.toggleSelectAll).toHaveBeenCalledWith(true);
    });

    test('個別チェックボックスでテンプレートを選択・解除できること', () => {
      const list = fixture.debugElement.query(By.directive(TemplateListItemsStub));
      list.componentInstance.itemSelectChange.emit({ id: '1', checked: true });
      expect(mockStore.toggleSelected).toHaveBeenCalledWith('1', true);
    });

    test('メニューボタンをクリックするとメニューが開閉されること', () => {
      expect(component.openMenuId()).toBeNull();
      component.toggleMenu('1');
      expect(component.openMenuId()).toBe('1');
      component.toggleMenu('1');
      expect(component.openMenuId()).toBeNull();
      component.toggleMenu('2');
      expect(component.openMenuId()).toBe('2');
    });

    test('選択解除ボタンをクリックするとすべての選択が解除されること', () => {
      component.clearSelection();
      expect(mockStore.clearSelection).toHaveBeenCalledTimes(1);
    });

    test('追加ボタンをクリックすると空のフォームでダイアログが開くこと', async () => {
      // Pre-fill addForm to confirm reset clears it
      component.addForm.setValue({
        name: 'leftover',
        systemPrompt: 'leftover',
        description: 'leftover',
        groups: ['x'],
      });
      await component.onAddTemplate();
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      const cfg = mockDialog.open.mock.calls[0][1];
      expect(cfg.maxWidth).toBe('800px');
      expect(component.addForm.value.name).toBe('');
      expect(component.addForm.value.groups).toEqual([]);
    });

    test('必須項目を入力しないと作成できないこと', async () => {
      await component.onAddTemplate();
      const ref = dialogRefs[0];
      // Form is empty → invalid (name + systemPrompt required)
      ref.componentInstance.data['confirmAction'] = ref.componentInstance.data[
        'confirmAction'
      ] as () => void;
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();
      expect(mockTemplateApi.create).not.toHaveBeenCalled();
      expect(ref.close).not.toHaveBeenCalled();
    });

    test('テンプレートを新規作成できること', async () => {
      await component.onAddTemplate();
      component.addForm.setValue({
        name: 'New Template',
        systemPrompt: 'Prompt',
        description: 'Desc',
        groups: ['1'],
      });
      mockTemplateApi.create.mockResolvedValue({
        id: '99',
        name: 'New Template',
        description: 'Desc',
        systemPrompt: 'Prompt',
        groups: ['1'],
        updatedAt: '2026-05-01T12:00:00',
      });
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockTemplateApi.create).toHaveBeenCalledWith({
        name: 'New Template',
        systemPrompt: 'Prompt',
        description: 'Desc',
      });
      expect(mockGroupTemplatesApi.addTemplates).toHaveBeenCalledWith('1', ['99']);
      const addOneArg = mockStore.addOne.mock.calls[0][0];
      expect(addOneArg.id).toBe('99');
      expect(addOneArg.teams).toEqual(['チームA']); // group id '1' → 'チームA'
      expect(mockToast.success).toHaveBeenCalledWith('TEMPLATES.CREATE_SUCCESS');
      expect(ref.close).toHaveBeenCalledWith(true);
    });

    test('テンプレートの作成に失敗するとエラーが表示されること', async () => {
      await component.onAddTemplate();
      component.addForm.setValue({
        name: 'X',
        systemPrompt: 'Y',
        description: '',
        groups: [],
      });
      mockTemplateApi.create.mockRejectedValue(new Error('boom'));
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockToast.error).toHaveBeenCalledWith('TEMPLATES.CREATE_FAILED');
      expect(mockStore.addOne).not.toHaveBeenCalled();
      expect(ref.close).not.toHaveBeenCalled();
    });

    test('編集ボタンをクリックすると対象テンプレートの内容でフォームが開くこと', async () => {
      const template: AdminTemplate = {
        id: '7',
        name: 'Old Name',
        description: 'Old Desc',
        systemPrompt: 'Old Prompt',
        teams: ['チームB'],
      };
      await component.onEditTemplate(template);
      expect(component.editForm.value.name).toBe('Old Name');
      expect(component.editForm.value.systemPrompt).toBe('Old Prompt');
      expect(component.editForm.value.description).toBe('Old Desc');
      // 'チームB' → group id '2'
      expect(component.editForm.value.groups).toEqual(['2']);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
    });

    test('テンプレートを編集できること', async () => {
      const template: AdminTemplate = {
        id: '7',
        name: 'Old',
        description: '',
        systemPrompt: 'P',
        teams: [],
      };
      await component.onEditTemplate(template);
      component.editForm.setValue({
        name: 'Updated',
        systemPrompt: 'New Prompt',
        description: '',
        groups: ['2'],
      });
      mockTemplateApi.update.mockResolvedValue({
        id: '7',
        name: 'Updated',
        description: '',
        systemPrompt: 'New Prompt',
        groups: ['2'],
        updatedAt: '2026-05-01T12:00:00',
      });
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockTemplateApi.update).toHaveBeenCalledWith('7', {
        name: 'Updated',
        systemPrompt: 'New Prompt',
        description: '',
      });
      expect(mockGroupTemplatesApi.addTemplates).toHaveBeenCalledWith('2', ['7']);
      expect(mockStore.updateOne).toHaveBeenCalled();
      const updateOneArg = mockStore.updateOne.mock.calls[0][0];
      expect(updateOneArg.id).toBe('7');
      expect(updateOneArg.teams).toEqual(['チームB']);
      expect(mockToast.success).toHaveBeenCalledWith('TEMPLATES.UPDATE_SUCCESS');
      expect(ref.close).toHaveBeenCalledWith(true);
    });

    test('テンプレート編集時に外したグループ紐付けが削除されること', async () => {
      const template: AdminTemplate = {
        id: '7',
        name: 'Old',
        description: '',
        systemPrompt: 'P',
        teams: ['チームA', 'チームB'],
      };
      await component.onEditTemplate(template);
      component.editForm.setValue({
        name: 'Updated',
        systemPrompt: 'New Prompt',
        description: '',
        groups: ['2'],
      });
      mockTemplateApi.update.mockResolvedValue({
        id: '7',
        name: 'Updated',
        description: '',
        systemPrompt: 'New Prompt',
        updatedAt: '2026-05-01T12:00:00',
      });
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockGroupTemplatesApi.remove).toHaveBeenCalledWith('1', '7');
      expect(ref.close).toHaveBeenCalledWith(true);
    });

    test('テンプレートの編集に失敗するとエラーが表示されること', async () => {
      const template: AdminTemplate = {
        id: '7',
        name: 'Old',
        description: '',
        systemPrompt: 'P',
        teams: [],
      };
      await component.onEditTemplate(template);
      component.editForm.setValue({
        name: 'Updated',
        systemPrompt: 'New Prompt',
        description: '',
        groups: [],
      });
      mockTemplateApi.update.mockRejectedValue(new Error('server error'));
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockToast.error).toHaveBeenCalledWith('TEMPLATES.UPDATE_FAILED');
      expect(mockStore.updateOne).not.toHaveBeenCalled();
      expect(ref.close).not.toHaveBeenCalled();
    });

    test('削除ボタンをクリックすると確認ダイアログが表示されること', () => {
      const template: AdminTemplate = {
        id: '5',
        name: 'X',
        description: '',
        systemPrompt: '',
        teams: [],
      };
      const list = fixture.debugElement.query(By.directive(TemplateListItemsStub));
      list.componentInstance.deleteTemplate.emit(template);
      expect(mockDialog.open).toHaveBeenCalledTimes(1);
      const cfg = mockDialog.open.mock.calls[0][1];
      expect(cfg.data.confirmText).toBe('COMMON.DELETE');
    });

    test('テンプレートを削除できること', async () => {
      const template: AdminTemplate = {
        id: '5',
        name: 'X',
        description: '',
        systemPrompt: '',
        teams: [],
      };
      mockTemplateApi.deleteOne.mockResolvedValue(undefined);
      component.onDeleteTemplate(template);
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockTemplateApi.deleteOne).toHaveBeenCalledWith('5');
      expect(mockStore.removeMany).toHaveBeenCalledWith(['5']);
      expect(mockToast.success).toHaveBeenCalledWith('TEMPLATES.DELETE_SUCCESS');
      expect(ref.close).toHaveBeenCalledWith(true);
    });

    test('複数テンプレートを選択して一括削除できること', async () => {
      selectedIdsSignal.set(new Set(['1', '2']));
      mockTemplateApi.deleteOne.mockResolvedValue(undefined);
      component.onDeleteTemplate();
      const ref = dialogRefs[0];
      (ref.componentInstance.data['confirmAction'] as () => void)();
      await flushMicrotasks();

      expect(mockTemplateApi.deleteOne).toHaveBeenCalledTimes(2);
      expect(mockTemplateApi.deleteOne).toHaveBeenNthCalledWith(1, '1');
      expect(mockTemplateApi.deleteOne).toHaveBeenNthCalledWith(2, '2');
      expect(mockStore.removeMany).toHaveBeenCalledWith(['1', '2']);
    });

    test('何も選択しない状態で削除操作してもダイアログが開かないこと', () => {
      selectedIdsSignal.set(new Set());
      component.onDeleteTemplate();
      expect(mockDialog.open).not.toHaveBeenCalled();
    });
  });
});
