import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Component, input, output, model, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';

import { TrainingDataFiltersComponent } from './training-data-filters.component';

// --- FakeTranslatePipe ---
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

const mockTranslate = {
  instant: vi.fn((key: string) => key),
  get: vi.fn(),
  onLangChange: { subscribe: vi.fn() },
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

// --- Child component stubs ---

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  readonly size = input<'default' | 'small'>('default');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly showClearButton = input<boolean>(true);
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-select-with-search', standalone: true, template: '' })
class SelectWithSearchStub {
  readonly size = input<'default' | 'small'>('default');
  readonly options = input.required<any[]>();
  readonly value = model<any>(null);
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly valueChange = output<any>();
}

@Component({ selector: 'app-period-filter', standalone: true, template: '' })
class PeriodFilterStub {
  readonly size = input<'default' | 'small'>('default');
  readonly options = input<any[]>([]);
  readonly value = model<string | null>(null);
  readonly range = model<any>(null);
  readonly selectionChange = output<any>();
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  readonly size = input<'default' | 'small'>('default');
  readonly options = input.required<any[]>();
  readonly value = model<any>(null);
  readonly placeholder = input<string>('');
  readonly valueChange = output<any>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly size = input<'sm' | 'md'>('md');
  readonly fields = model<any[]>([]);
  readonly selectedField = model<string | null>(null);
  readonly selectedOrder = model<string | null>(null);
  readonly placeholder = input<string>('');
  readonly fieldChange = output<string | null>();
  readonly orderChange = output<string | null>();
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly showPageSize = input<boolean>(true);
  readonly showPageNumbers = input<boolean>(true);
  readonly useQueryParams = input<boolean>(true);
  readonly showFirstLast = input<boolean>(true);
  readonly countDisplay = input<string>('');
  readonly totalPages = input.required<number>();
  readonly currentPageOverride = input<number | null>(null);
  readonly pageChange = output<number>();
}

// --- Default input values ---
const defaultInputs = {
  query: '',
  userOptions: [
    { value: '', label: 'All' },
    { value: 'user1', label: 'User 1' },
  ],
  selectedUser: null as string | null,
  periodOptions: [
    { value: '', label: 'All' },
    { value: 'today', label: 'Today' },
  ],
  selectedPeriod: null as string | null,
  filterPeriodRange: null,
  statusOptions: [
    { value: '', label: 'All' },
    { value: 'ON', label: 'ON' },
  ],
  selectedStatus: null as string | null,
  sortOptions: [
    { value: 'updatedAt', label: 'Updated' },
    { value: 'name', label: 'Name' },
  ],
  sortField: null as string | null,
  sortOrder: null as string | null,
  countDisplay: '1-10件 / 50件',
  totalPages: 5,
  currentPage: 1,
};

// --- TestBed factory ---
const configureTestingModule = async () => {
  return await TestBed.configureTestingModule({
    imports: [TrainingDataFiltersComponent, NoopAnimationsModule],
    providers: [{ provide: TranslateService, useValue: mockTranslate }],
  })
    .overrideComponent(TrainingDataFiltersComponent, {
      set: {
        imports: [
          CommonModule,
          FakeTranslatePipe,
          SearchInputStub,
          SelectWithSearchStub,
          PeriodFilterStub,
          SelectStub,
          FormSortInputStub,
          PaginationStub,
        ],
      },
    })
    .compileComponents();
};

const setAllInputs = (fixture: ComponentFixture<TrainingDataFiltersComponent>) => {
  Object.entries(defaultInputs).forEach(([key, value]) => {
    fixture.componentRef.setInput(key, value);
  });
};

describe('TrainingDataFiltersComponent', () => {
  let component: TrainingDataFiltersComponent;
  let fixture: ComponentFixture<TrainingDataFiltersComponent>;

  beforeEach(async () => {
    await configureTestingModule();
    fixture = TestBed.createComponent(TrainingDataFiltersComponent);
    component = fixture.componentInstance;
    setAllInputs(fixture);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // =========================================================================
  describe('初期値・ゲッター', () => {
    test('コンポーネントが生成されること', () => {
      expect(component).toBeTruthy();
    });

    test('入力値が正しく設定されること', () => {
      expect(component.query()).toBe('');
      expect(component.userOptions()).toEqual(defaultInputs.userOptions);
      expect(component.selectedUser()).toBeNull();
      expect(component.periodOptions()).toEqual(defaultInputs.periodOptions);
      expect(component.selectedPeriod()).toBeNull();
      expect(component.filterPeriodRange()).toBeNull();
      expect(component.statusOptions()).toEqual(defaultInputs.statusOptions);
      expect(component.selectedStatus()).toBeNull();
      expect(component.sortOptions()).toEqual(defaultInputs.sortOptions);
      expect(component.countDisplay()).toBe('1-10件 / 50件');
      expect(component.totalPages()).toBe(5);
      expect(component.currentPage()).toBe(1);
    });

    test('modelの初期値が正しいこと', () => {
      expect(component.sortField()).toBeNull();
      expect(component.sortOrder()).toBeNull();
    });
  });

  // =========================================================================
  describe('DOM要素表示', () => {
    test('検索ラベルが表示されること', () => {
      const labels = fixture.debugElement.queryAll(By.css('.text-label'));
      const searchLabel = labels[0];
      expect(searchLabel).toBeTruthy();
      expect(searchLabel.nativeElement.textContent.trim()).toBe('LEARNING_DATA.SEARCH_LABEL');
    });

    test('フィルターラベルが表示されること', () => {
      const labels = fixture.debugElement.queryAll(By.css('.text-label'));
      const filterLabel = labels[1];
      expect(filterLabel).toBeTruthy();
      expect(filterLabel.nativeElement.textContent.trim()).toBe('LEARNING_DATA.FILTER_LABEL');
    });

    test('ソートラベルが表示されること', () => {
      const labels = fixture.debugElement.queryAll(By.css('.text-label'));
      const sortLabel = labels[2];
      expect(sortLabel).toBeTruthy();
      expect(sortLabel.nativeElement.textContent.trim()).toBe('LEARNING_DATA.SORT_LABEL');
    });

    test('検索入力が表示されること', () => {
      const searchInput = fixture.debugElement.query(By.directive(SearchInputStub));
      expect(searchInput).toBeTruthy();
      expect(searchInput.componentInstance.value()).toBe('');
    });

    test('検索入力にqueryの値が渡されること', () => {
      fixture.componentRef.setInput('query', 'test search');
      fixture.detectChanges();
      const searchInput = fixture.debugElement.query(By.directive(SearchInputStub));
      expect(searchInput.componentInstance.value()).toBe('test search');
    });

    test('ユーザーフィルターが表示されること', () => {
      const selectWithSearch = fixture.debugElement.query(By.directive(SelectWithSearchStub));
      expect(selectWithSearch).toBeTruthy();
      expect(selectWithSearch.componentInstance.options()).toEqual(defaultInputs.userOptions);
    });

    test('期間フィルターが表示されること', () => {
      const periodFilter = fixture.debugElement.query(By.directive(PeriodFilterStub));
      expect(periodFilter).toBeTruthy();
      expect(periodFilter.componentInstance.options()).toEqual(defaultInputs.periodOptions);
    });

    test('ステータスフィルターが表示されること', () => {
      const select = fixture.debugElement.query(By.directive(SelectStub));
      expect(select).toBeTruthy();
      expect(select.componentInstance.options()).toEqual(defaultInputs.statusOptions);
    });

    test('ソート入力が表示されること', () => {
      const sortInput = fixture.debugElement.query(By.directive(FormSortInputStub));
      expect(sortInput).toBeTruthy();
      expect(sortInput.componentInstance.fields()).toEqual(defaultInputs.sortOptions);
    });

    test('ページネーションが表示されること', () => {
      const pagination = fixture.debugElement.query(By.directive(PaginationStub));
      expect(pagination).toBeTruthy();
      expect(pagination.componentInstance.totalPages()).toBe(5);
      expect(pagination.componentInstance.currentPageOverride()).toBe(1);
      expect(pagination.componentInstance.countDisplay()).toBe('1-10件 / 50件');
    });

    test('ユーザーフィルターでselectedUserが"all"の場合nullが渡されること', () => {
      fixture.componentRef.setInput('selectedUser', 'all');
      fixture.detectChanges();
      const selectWithSearch = fixture.debugElement.query(By.directive(SelectWithSearchStub));
      expect(selectWithSearch.componentInstance.value()).toBeNull();
    });

    test('ユーザーフィルターでselectedUserが値ありの場合そのまま渡されること', () => {
      fixture.componentRef.setInput('selectedUser', 'user1');
      fixture.detectChanges();
      const selectWithSearch = fixture.debugElement.query(By.directive(SelectWithSearchStub));
      expect(selectWithSearch.componentInstance.value()).toBe('user1');
    });
  });

  // =========================================================================
  describe('DOM要素イベント', () => {
    test('検索入力のvalueChangeでsearchQueryが発火すること', () => {
      const spy = vi.spyOn(component.searchQuery, 'emit');
      const searchInput = fixture.debugElement.query(By.directive(SearchInputStub));
      (searchInput.componentInstance as SearchInputStub).valueChange.emit('new query');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('new query');
    });

    test('ユーザーフィルターのvalueChangeでuserChangeが発火すること', () => {
      const spy = vi.spyOn(component.userChange, 'emit');
      const selectWithSearch = fixture.debugElement.query(By.directive(SelectWithSearchStub));
      (selectWithSearch.componentInstance as SelectWithSearchStub).valueChange.emit('user1');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('user1');
    });

    test('期間フィルターのselectionChangeでperiodChangeが発火すること', () => {
      const spy = vi.spyOn(component.periodChange, 'emit');
      const periodFilter = fixture.debugElement.query(By.directive(PeriodFilterStub));
      const periodEvent = { value: 'today', range: null };
      (periodFilter.componentInstance as PeriodFilterStub).selectionChange.emit(periodEvent);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(periodEvent);
    });

    test('ステータスフィルターのvalueChangeでstatusChangeが発火すること', () => {
      const spy = vi.spyOn(component.statusChange, 'emit');
      const select = fixture.debugElement.query(By.directive(SelectStub));
      (select.componentInstance as SelectStub).valueChange.emit('ON');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('ON');
    });

    test('ソート入力のfieldChangeでsortFieldChangeが発火すること', () => {
      const spy = vi.spyOn(component.sortFieldChange, 'emit');
      const sortInput = fixture.debugElement.query(By.directive(FormSortInputStub));
      (sortInput.componentInstance as FormSortInputStub).fieldChange.emit('name');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('name');
    });

    test('ソート入力のorderChangeでsortOrderChangeが発火すること', () => {
      const spy = vi.spyOn(component.sortOrderChange, 'emit');
      const sortInput = fixture.debugElement.query(By.directive(FormSortInputStub));
      (sortInput.componentInstance as FormSortInputStub).orderChange.emit('asc');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('asc');
    });

    test('ページネーションのpageChangeでpageChangeが発火すること', () => {
      const spy = vi.spyOn(component.pageChange, 'emit');
      const pagination = fixture.debugElement.query(By.directive(PaginationStub));
      (pagination.componentInstance as PaginationStub).pageChange.emit(3);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(3);
    });

    test('入力値が変更された場合に子コンポーネントに反映されること', () => {
      fixture.componentRef.setInput('countDisplay', '11-20件 / 50件');
      fixture.componentRef.setInput('totalPages', 10);
      fixture.componentRef.setInput('currentPage', 2);
      fixture.detectChanges();

      const pagination = fixture.debugElement.query(By.directive(PaginationStub));
      expect(pagination.componentInstance.countDisplay()).toBe('11-20件 / 50件');
      expect(pagination.componentInstance.totalPages()).toBe(10);
      expect(pagination.componentInstance.currentPageOverride()).toBe(2);
    });
  });
});
