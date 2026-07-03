import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { GroupDetailTemplatesComponent } from './group-detail-templates.component';
import { GroupTemplatesStore } from '../../stores/group-templates.store';
import { GroupTemplatesApiService } from '../../services/group-templates-api.service';
import { ToastService } from '../../../../../../core/services/toast.service';
import type { TemplateApiItem } from '../../../../../../../types/admin/template.types';

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

function makeTemplate(overrides: Partial<TemplateApiItem> = {}): TemplateApiItem {
  return {
    id: 't1',
    name: 'Template 1',
    description: 'Desc',
    systemPrompt: 'Do something',
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
    addTemplates: vi.fn().mockResolvedValue(undefined),
    removeTemplates: vi.fn().mockResolvedValue(undefined),
    selectedIds: vi.fn().mockReturnValue(new Set<string>()),
    pageRange: vi.fn().mockReturnValue({ from: 0, to: 0, total: 0 }),
    groupId: vi.fn().mockReturnValue(groupId),
    filter: vi.fn().mockReturnValue({ pageIndex: 1, pageSize: 25 }),
  };
  const relatedApi = {
    list: vi.fn().mockResolvedValue({
      content: [{ id: 't2', name: 'Template 2', description: '', systemPrompt: '' }],
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
      GroupDetailTemplatesComponent,
      { provide: GroupTemplatesStore, useValue: storeSpy },
      { provide: GroupTemplatesApiService, useValue: relatedApi },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: ActivatedRoute, useValue: activatedRoute },
    ],
  };
}

// ─── GroupDetailTemplatesComponent ───────────────────────────────────────────

describe('GroupDetailTemplatesComponent', () => {
  let component: GroupDetailTemplatesComponent;
  let storeSpy: ReturnType<typeof buildSetup>['storeSpy'];
  let relatedApi: ReturnType<typeof buildSetup>['relatedApi'];
  let toast: ReturnType<typeof buildSetup>['toast'];
  let dialog: ReturnType<typeof buildSetup>['dialog'];
  let dialogRef: ReturnType<typeof buildSetup>['dialogRef'];

  beforeEach(async () => {
    const setup = buildSetup('grp-99');
    ({ storeSpy, relatedApi, toast, dialog, dialogRef } = setup);
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: setup.providers,
    });
    await TestBed.compileComponents();
    component = TestBed.inject(GroupDetailTemplatesComponent);
    // flush the constructor effect which reads the route param signal
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  // ── effect: setGroup ──────────────────────────────────────────────────────

  it('calls store.setGroup with the parent route id on init', () => {
    expect(storeSpy.setGroup).toHaveBeenCalledWith('grp-99');
  });

  // ── onFilterChange ────────────────────────────────────────────────────────

  describe('onFilterChange', () => {
    it('passes query/sortField/sortOrder to store.updateFilter', () => {
      component.onFilterChange({ query: 'hello', sortField: 'name', sortOrder: 'asc' });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'hello', sortField: 'name', sortOrder: 'asc' }),
      );
    });

    it('converts empty query to undefined search', () => {
      component.onFilterChange({ query: '', sortField: 'addedAt', sortOrder: 'desc' });
      expect(storeSpy.updateFilter).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined }),
      );
    });

    it('converts empty sortField to undefined', () => {
      component.onFilterChange({ query: '', sortField: '', sortOrder: 'desc' });
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
    component.onItemSelect({ id: 't7', checked: false });
    expect(storeSpy.toggleSelected).toHaveBeenCalledWith('t7', false);
  });

  // ── openAddTemplateModal ──────────────────────────────────────────────────

  describe('openAddTemplateModal', () => {
    it('loads template options and opens dialog', async () => {
      await component.openAddTemplateModal();
      expect(relatedApi.list).toHaveBeenCalled();
      expect(component.templateOptions).toHaveLength(1);
      expect(dialog.open).toHaveBeenCalled();
    });

    it('resets selection to empty before opening', async () => {
      component.selectedTemplates.set(['t1', 't2']);
      await component.openAddTemplateModal();
      expect(component.selectedTemplates()).toEqual([]);
    });

    it('on confirm: calls store.addTemplates and shows success toast', async () => {
      await component.openAddTemplateModal();
      component.selectedTemplates.set(['t2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addTemplates).toHaveBeenCalledWith(['t2']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: skips submit when selection is empty', async () => {
      await component.openAddTemplateModal();
      component.selectedTemplates.set([]);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.addTemplates).not.toHaveBeenCalled();
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.addTemplates.mockRejectedValue(new Error('fail'));
      await component.openAddTemplateModal();
      component.selectedTemplates.set(['t2']);
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });

  // ── deleteTemplate ────────────────────────────────────────────────────────

  describe('deleteTemplate', () => {
    it('opens dialog for a specific template id', () => {
      component.deleteTemplate('t5');
      expect(dialog.open).toHaveBeenCalled();
    });

    it('opens dialog using selected ids when no id is passed', () => {
      storeSpy.selectedIds.mockReturnValue(new Set(['t1', 't2']));
      component.deleteTemplate();
      expect(dialog.open).toHaveBeenCalled();
    });

    it('does nothing when no id and selection is empty', () => {
      storeSpy.selectedIds.mockReturnValue(new Set<string>());
      component.deleteTemplate();
      expect(dialog.open).not.toHaveBeenCalled();
    });

    it('on confirm: calls store.removeTemplates and shows success toast', async () => {
      component.deleteTemplate('t5');
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(storeSpy.removeTemplates).toHaveBeenCalledWith(['t5']);
      expect(toast.success).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it('on confirm: shows error toast when store throws', async () => {
      storeSpy.removeTemplates.mockRejectedValue(new Error('gone'));
      component.deleteTemplate('t5');
      const confirmAction = dialogRef.componentInstance.data.confirmAction as () => Promise<void>;
      await confirmAction();
      expect(toast.error).toHaveBeenCalled();
    });
  });
});

// ─── GroupTemplatesFilterComponent ───────────────────────────────────────────

import { GroupTemplatesFilterComponent } from './components/group-templates-filter/group-templates-filter.component';

describe('GroupTemplatesFilterComponent', () => {
  let filter: GroupTemplatesFilterComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupTemplatesFilterComponent],
      providers: [provideRouter([]), GroupTemplatesFilterComponent],
    });
    await TestBed.compileComponents();
    filter = TestBed.inject(GroupTemplatesFilterComponent);
  });

  it('onSearchChange emits filterChange with updated query', () => {
    const spy = vi.spyOn(filter.filterChange, 'emit');
    filter.onSearchChange('keyword');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'keyword', sortField: '', sortOrder: 'desc' }),
    );
  });

  it('onSortFieldChange emits correct sortField', () => {
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
    filter.onPageChange(2);
    expect(spy).toHaveBeenCalledWith(2);
  });
});

// ─── GroupTemplatesTableComponent ────────────────────────────────────────────

import { GroupTemplatesTableComponent } from './components/group-templates-table/group-templates-table.component';

describe('GroupTemplatesTableComponent', () => {
  let table: GroupTemplatesTableComponent;
  let fixture: ComponentFixture<GroupTemplatesTableComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), GroupTemplatesTableComponent],
      providers: [provideRouter([])],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(GroupTemplatesTableComponent);
    fixture.componentRef.setInput('items', [makeTemplate({ updatedAt: '2026-01-02T03:04:00' })]);
    fixture.componentRef.setInput('selectedIds', new Set(['t1']));
    fixture.detectChanges();
    table = fixture.componentInstance;
  });

  it('isSelected returns true when id is in the set', () => {
    expect(table.isSelected('t1')).toBe(true);
  });

  it('isSelected returns false when id is not in the set', () => {
    expect(table.isSelected('t9')).toBe(false);
  });

  it('更新日時が表示されること', () => {
    expect(fixture.nativeElement.textContent).toContain('2026/01/02 03:04');
  });
});
