import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { GroupDetailAssistantsComponent } from './group-detail-assistants.component';
import { GroupAssistantsStore } from '../../stores/group-assistants.store';
import { GroupAssistantsApiService } from '../../services/group-assistants-api.service';
import { ToastService } from '../../../../../../core/services/toast.service';
import type { GroupAssistantItem } from '../../../../../../../types/admin/group-management.types';

// ─── helpers ────────────────────────────────────────────────────────────────

type DialogRefSpy = MatDialogRef<unknown> & {
  componentInstance: { data: { confirmAction?: () => unknown } & Record<string, unknown> };
  close: ReturnType<typeof vi.fn>;
};

function buildDialogRef(): DialogRefSpy {
  return {
    close: vi.fn(),
    componentInstance: { data: {} as { confirmAction?: () => unknown } & Record<string, unknown> },
  } as unknown as DialogRefSpy;
}

function makeAssistant(overrides: Partial<GroupAssistantItem> = {}): GroupAssistantItem {
  return {
    id: 'a1',
    name: 'Assistant 1',
    description: 'Desc',
    type: 'SECURE',
    indexId: '',
    iconColor: '#000000',
    groups: [],
    category: { id: 'cat-1', name: 'Cat 1', description: '' },
    categories: [{ id: 'cat-1', name: 'Cat 1', description: '' }],
    endpoints: [],
    serverLabel: 'ローカル',
    historyLabel: 'ON',
    endpointLabel: '',
    ...overrides,
  };
}

function buildSetup(groupId = 'g1') {
  const storeSpy = {
    setGroup: vi.fn(),
    updateFilter: vi.fn(),
    updatePageIndex: vi.fn(),
    toggleSelectAll: vi.fn(),
    toggleSelected: vi.fn(),
    clearSelection: vi.fn(),
    addAssistants: vi.fn().mockResolvedValue(undefined),
    removeAssistants: vi.fn().mockResolvedValue(undefined),
    selectedIds: vi.fn().mockReturnValue(new Set<string>()),
    pageRange: vi.fn().mockReturnValue({ from: 0, to: 0, total: 0 }),
    groupId: vi.fn().mockReturnValue(groupId),
    filter: vi.fn().mockReturnValue({ pageIndex: 1, pageSize: 25 }),
  };
  const relatedApi = {
    list: vi.fn().mockResolvedValue({
      content: [
        {
          id: 'a2',
          name: 'Assist 2',
          description: '',
          type: 'SECURE',
          includeHistory: false,
          iconColor: '',
          groups: [],
          category: null,
          endpoints: [],
        },
      ],
      totalElements: 1,
      number: 0,
      size: 25,
    }),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  const dialogRef = buildDialogRef();
  const dialog = { open: vi.fn().mockReturnValue(dialogRef) };

  const parentParamMap = convertToParamMap({ id: groupId });
  const activatedRoute = {
    parent: { paramMap: of(parentParamMap) },
    snapshot: { parent: { paramMap: parentParamMap } },
    paramMap: of(convertToParamMap({})),
  };

  return {
    storeSpy,
    relatedApi,
    toast,
    dialog,
    dialogRef,
    providers: [
      GroupDetailAssistantsComponent,
      { provide: GroupAssistantsStore, useValue: storeSpy },
      { provide: GroupAssistantsApiService, useValue: relatedApi },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: ActivatedRoute, useValue: activatedRoute },
    ],
  };
}

// ─── GroupDetailAssistantsComponent ──────────────────────────────────────────

describe('GroupDetailAssistantsComponent', () => {
  let component: GroupDetailAssistantsComponent;
  let storeSpy: ReturnType<typeof buildSetup>['storeSpy'];
  let relatedApi: ReturnType<typeof buildSetup>['relatedApi'];
  let toast: ReturnType<typeof buildSetup>['toast'];
  let dialog: ReturnType<typeof buildSetup>['dialog'];
  let dialogRef: ReturnType<typeof buildSetup>['dialogRef'];

  beforeEach(async () => {
    const setup = buildSetup('grp-10');
    ({ storeSpy, relatedApi, toast, dialog, dialogRef } = setup);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: setup.providers,
    });
    await TestBed.compileComponents();
    component = TestBed.inject(GroupDetailAssistantsComponent);
    // flush the constructor effect which reads the route param signal
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // ── effect: setGroup ──────────────────────────────────────────────────────

  it('calls store.setGroup with the parent route id on init', () => {
    expect(storeSpy.setGroup).toHaveBeenCalledWith('grp-10');
  });

  // ── onFilterChange ────────────────────────────────────────────────────────

  describe('onFilterChange', () => {
    it('passes search/type/categoryId/sortField/sortOrder to store.updateFilter', () => {
      component.onFilterChange({
        query: 'hello',
        typeFilter: 'SECURE',
        categoryFilter: 'cat-a',
        sortField: 'name',
        sortOrder: 'asc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({
          search: 'hello',
          type: 'SECURE',
          categoryId: 'cat-a',
          sortField: 'name',
          sortOrder: 'asc',
        }),
      );
    });

    it('converts empty typeFilter to undefined', () => {
      component.onFilterChange({
        query: '',
        typeFilter: '',
        categoryFilter: '',
        sortField: '',
        sortOrder: 'desc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined, type: undefined, categoryId: undefined }),
      );
    });

    it('converts empty sortField to undefined', () => {
      component.onFilterChange({
        query: '',
        typeFilter: '',
        categoryFilter: '',
        sortField: '',
        sortOrder: 'desc',
      });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ sortField: undefined }),
      );
    });
  });

  // ── onSelectAll / onItemSelect ────────────────────────────────────────────

  it('onSelectAll delegates to store.toggleSelectAll', () => {
    component.onSelectAll(true);
    expect(storeSpy.toggleSelectAll).toHaveBeenCalledWith(true);
    component.onSelectAll(false);
    expect(storeSpy.toggleSelectAll).toHaveBeenCalledWith(false);
  });

  it('onItemSelect delegates to store.toggleSelected', () => {
    component.onItemSelect({ id: 'a9', checked: true });
    expect(storeSpy.toggleSelected).toHaveBeenCalledWith('a9', true);
  });

  // ── openAddAssistantModal ─────────────────────────────────────────────────

  describe('openAddAssistantModal', () => {
    it('loads assistant options and opens dialog', async () => {
      await component.openAddAssistantModal();
      expect(relatedApi.list).toHaveBeenCalled();
      expect(component.assistantOptions).toHaveLength(1);
      expect(dialog.open).toHaveBeenCalled();
    });

    it('resets selection to empty before opening', async () => {
      component.selectedAssistants.set(['a1', 'a2']);
      await component.openAddAssistantModal();
      expect(component.selectedAssistants()).toEqual([]);
    });

    it('on confirm: calls store.addAssistants and shows success toast', async () => {
      await component.openAddAssistantModal();
      component.selectedAssistants.set(['a2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addAssistants).toHaveBeenCalledWith(['a2']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: skips submit when selection is empty', async () => {
      await component.openAddAssistantModal();
      component.selectedAssistants.set([]);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addAssistants).not.toHaveBeenCalled();
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.addAssistants.mockRejectedValue(new Error('fail'));
      await component.openAddAssistantModal();
      component.selectedAssistants.set(['a2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ── deleteAssistant ───────────────────────────────────────────────────────

  describe('deleteAssistant', () => {
    it('opens dialog for a specific assistant id', () => {
      component.deleteAssistant('a5');
      expect(dialog.open).toHaveBeenCalled();
    });

    it('opens dialog using selected ids when no id is passed', () => {
      storeSpy.selectedIds.mockReturnValue(new Set(['a1', 'a2']));
      component.deleteAssistant();
      expect(dialog.open).toHaveBeenCalled();
    });

    it('does nothing when no id and selection is empty', () => {
      storeSpy.selectedIds.mockReturnValue(new Set<string>());
      component.deleteAssistant();
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('on confirm: calls store.removeAssistants and shows success toast', async () => {
      component.deleteAssistant('a5');
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.removeAssistants).toHaveBeenCalledWith(['a5']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.removeAssistants.mockRejectedValue(new Error('gone'));
      component.deleteAssistant('a5');
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ── openDeleteSelectedModal ───────────────────────────────────────────────

  it('openDeleteSelectedModal delegates to deleteAssistant with no arg (no-op when empty)', () => {
    storeSpy.selectedIds.mockReturnValue(new Set<string>());
    component.openDeleteSelectedModal();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('openDeleteSelectedModal opens dialog when selection is non-empty', () => {
    storeSpy.selectedIds.mockReturnValue(new Set(['a1']));
    component.openDeleteSelectedModal();
    expect(dialog.open).toHaveBeenCalled();
  });
});

// ─── GroupAssistantsFilterComponent ──────────────────────────────────────────

import { GroupAssistantsFilterComponent } from './components/group-assistants-filter/group-assistants-filter.component';
import { AssistantListApiService } from '@features/admin/management/assistant-list/services/assistant-list-api.service';

describe('GroupAssistantsFilterComponent', () => {
  let filter: GroupAssistantsFilterComponent;
  const assistantListApi = {
    listCategories: vi.fn().mockResolvedValue([
      { id: 'cat-1', name: '営業支援', description: '', updatedAt: '2024-01-01' },
      { id: 'cat-2', name: '開発', description: '', updatedAt: '2024-01-01' },
    ]),
  };

  beforeEach(async () => {
    assistantListApi.listCategories.mockClear();
    assistantListApi.listCategories.mockResolvedValue([
      { id: 'cat-1', name: '営業支援', description: '', updatedAt: '2024-01-01' },
      { id: 'cat-2', name: '開発', description: '', updatedAt: '2024-01-01' },
    ]);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupAssistantsFilterComponent],
      providers: [
        provideRouter([]),
        GroupAssistantsFilterComponent,
        { provide: AssistantListApiService, useValue: assistantListApi },
      ],
    });
    await TestBed.compileComponents();
    filter = TestBed.inject(GroupAssistantsFilterComponent);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('loads category options from API using category id as value', () => {
    expect(assistantListApi.listCategories).toHaveBeenCalled();
    expect(filter.categoryOptions().map((o) => o.value)).toEqual(['', 'cat-1', 'cat-2']);
    expect(filter.categoryOptions().map((o) => o.label)).toEqual([
      'TEAM.ASSISTANT.ALL_CATEGORIES',
      '営業支援',
      '開発',
    ]);
  });

  it('onSearchChange emits correct query', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSearchChange('hello');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ query: 'hello' }));
  });

  it('onTypeFilterChange emits correct typeFilter', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onTypeFilterChange('SECURE');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ typeFilter: 'SECURE' }));
  });

  it('onTypeFilterChange defaults to empty string on null', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onTypeFilterChange(null);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ typeFilter: '' }));
  });

  it('onCategoryFilterChange emits correct categoryFilter', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onCategoryFilterChange('cat-x');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ categoryFilter: 'cat-x' }));
  });

  it('onCategoryFilterChange defaults to empty string on null', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onCategoryFilterChange(null);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ categoryFilter: '' }));
  });

  it('onSortFieldChange emits sortField (or empty string when null)', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSortFieldChange('name');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sortField: 'name' }));
  });

  it('onSortFieldChange emits empty string when null', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSortFieldChange(null);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sortField: '' }));
  });

  it('onSortOrderChange emits correct sortOrder', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSortOrderChange('asc');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 'asc' }));
  });

  it('onPageChange emits pageIndexChange', () => {
    const spy = vi.spyOn(filter.pageIndexChange, 'emit');
    filter.onPageChange(5);
    expect(spy).toHaveBeenCalledWith(5);
  });
});

// ─── GroupAssistantsTableComponent ───────────────────────────────────────────

import { GroupAssistantsTableComponent } from './components/group-assistants-table/group-assistants-table.component';

describe('GroupAssistantsTableComponent', () => {
  let table: GroupAssistantsTableComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupAssistantsTableComponent],
      providers: [provideRouter([])],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(GroupAssistantsTableComponent);
    fixture.componentRef.setInput('items', [makeAssistant()]);
    fixture.componentRef.setInput('selectedIds', new Set(['a1']));
    fixture.detectChanges();
    table = fixture.componentInstance;
  });

  it('isSelected returns true when id is in the set', () => {
    expect(table.isSelected('a1')).toBe(true);
  });

  it('isSelected returns false when id is not in the set', () => {
    expect(table.isSelected('a9')).toBe(false);
  });
});
