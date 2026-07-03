import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, TemplateRef, input, output, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryTermsMockService } from '../services/glossary-terms-mock.service';
import { GlossaryDictionaryAssistantsApiService } from '../services/glossary-dictionary-assistants-api.service';
import { TermWordAssistantAdminComponent } from './term-word-assistant-admin.component';
import type { GlossaryDictionaryAssistantRow } from '@app-types/admin/glossary-dictionary.types';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-select', standalone: true, template: '' })
class SelectStub {
  readonly options = input<unknown[]>([]);
  readonly value = input<string | null>(null);
  readonly placeholder = input<string>('');
  readonly size = input<string>('');
  readonly valueChange = output<string | null>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly fields = input<unknown[]>([]);
  readonly selectedField = input<string | null>(null);
  readonly selectedFieldChange = output<string | null>();
  readonly selectedOrder = input<string>('desc');
  readonly selectedOrderChange = output<string>();
  readonly placeholder = input<string>('');
  readonly size = input<string>('');
}

@Component({ selector: 'app-combobox-multi', standalone: true, template: '' })
class ComboboxMultiStub {
  readonly id = input.required<string>();
  readonly name = input.required<string>();
  readonly label = input<string>('');
  readonly any = input<boolean>(false);
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly searchHint = input<string>('');
  readonly panelSize = input<string>('default');
  readonly options = input<unknown[]>([]);
  readonly value = input<string[]>([]);
  readonly valueChange = output<string[]>();
}

@Component({ selector: 'app-button', standalone: true, template: '' })
class ButtonStub {
  readonly buttonClick = output<void>();
  readonly variant = input<string>('');
  readonly size = input<string>('');
  readonly intent = input<string>('');
  readonly fullWidth = input<boolean>(false);
}

@Component({ selector: 'app-icon-button', standalone: true, template: '' })
class IconButtonStub {
  readonly ariaLabel = input<string>('');
  readonly variant = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input<number>(1);
  readonly currentPageOverride = input<number>(1);
  readonly useQueryParams = input<boolean>(false);
  readonly showPageSize = input<boolean>(false);
  readonly showFirstLast = input<boolean>(false);
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-table-list', standalone: true, template: '<ng-content />' })
class TableListStub {}

@Component({ selector: 'app-table-list-item', standalone: true, template: '<ng-content />' })
class TableListItemStub {
  readonly isHeader = input<boolean>(false);
  readonly showCheckbox = input<boolean>(false);
  readonly checked = input<boolean>(false);
  readonly indeterminate = input<boolean>(false);
  readonly checkedChange = output<boolean>();
}

@Component({ selector: 'app-context-menu', standalone: true, template: '' })
class ContextMenuStub {
  readonly menuTpl = input<TemplateRef<unknown> | null>(null);
  readonly customTrigger = input<TemplateRef<unknown> | null>(null);
  readonly panelClass = input<string>('');
  readonly menuMinWidth = input<string>('');
}

describe('TermWordAssistantAdminComponent', () => {
  let fixture: ComponentFixture<TermWordAssistantAdminComponent>;
  const langChange$ = new Subject<unknown>();

  const mockDialog: Pick<MatDialog, 'open' | 'closeAll'> = {
    open: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockTranslate: Pick<TranslateService, 'instant' | 'onLangChange' | 'currentLang'> = {
    instant: vi.fn((key: string) => key),
    onLangChange: langChange$ as unknown as TranslateService['onLangChange'],
    currentLang: 'ja',
  };

  const mockRoute: Partial<ActivatedRoute> = {
    parent: {
      snapshot: { paramMap: convertToParamMap({ glossaryId: '1' }) },
      paramMap: of(convertToParamMap({ glossaryId: '1' })),
    } as never,
  };

  const itemsSig = signal([
    {
      id: '1',
      name: 'Dict',
      definition: 'd',
      tags: [],
      editedDate: new Date(),
      creator: 'c',
      category: 'x',
      assistant: '',
    },
  ]);
  const mockGlossary: Pick<GlossaryTermsMockService, 'getItemById' | 'assistantOptions'> = {
    getItemById: vi.fn((id: string) => itemsSig().find((i) => i.id === id)),
    assistantOptions: signal([{ label: 'A', value: 'assistant-a' }]),
  };

  const mockAssistantRows: GlossaryDictionaryAssistantRow[] = Array.from(
    { length: 28 },
    (_, i) => ({
      id: `a${i + 1}`,
      name: 'アシスタントの名前',
      description: 'desc',
      server: 'クラウド(一般)',
      model: 'gpt-4o-mini-2024-07-18',
      category: 'カテゴリカテゴリ',
      history: 'ON',
    }),
  );

  const mockAssistantsApi: Pick<GlossaryDictionaryAssistantsApiService, 'list'> = {
    list: vi.fn(async () => ({ data: mockAssistantRows, total: mockAssistantRows.length })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TermWordAssistantAdminComponent],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: GlossaryTermsMockService, useValue: mockGlossary },
        { provide: GlossaryDictionaryAssistantsApiService, useValue: mockAssistantsApi },
      ],
    })
      .overrideComponent(TermWordAssistantAdminComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            SelectStub,
            FormSortInputStub,
            ComboboxMultiStub,
            ButtonStub,
            IconButtonStub,
            SvgIconStub,
            PaginationStub,
            TableListStub,
            TableListItemStub,
            ContextMenuStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TermWordAssistantAdminComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態で選択がないこと', () => {
      expect(fixture.componentInstance.hasSelection()).toBe(false);
      expect(fixture.componentInstance.showCreateBar()).toBe(true);
    });
  });

  describe('DOM要素表示', () => {
    test('テーブルが描画されること', () => {
      expect(fixture.debugElement.query(By.directive(TableListStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('openAddAssistantでdialog.openが呼ばれること', () => {
      fixture.componentInstance.openAddAssistant();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('onToggleSelectAllでselectedAssistantIdsが更新されること', () => {
      fixture.componentInstance.onToggleSelectAll(true);
      expect(fixture.componentInstance.selectedAssistantIds().size).toBeGreaterThan(0);
      fixture.componentInstance.onToggleSelectAll(false);
      expect(fixture.componentInstance.selectedAssistantIds().size).toBe(0);
    });

    test('openDeleteModalでdialog.openが呼ばれること', () => {
      fixture.componentInstance.onToggleSelectAll(true);
      fixture.componentInstance.openDeleteModal();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });
});
