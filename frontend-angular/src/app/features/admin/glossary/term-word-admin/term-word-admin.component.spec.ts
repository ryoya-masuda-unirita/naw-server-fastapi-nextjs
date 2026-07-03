import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, TemplateRef, input, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject, of } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { TermWordAdminComponent } from './term-word-admin.component';
import { GlossaryDictionaryWordsApiService } from '../services/glossary-dictionary-words-api.service';
import type { GlossaryWordTableRow } from '@app-types/admin/glossary-dictionary.types';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly size = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-period-filter', standalone: true, template: '' })
class PeriodFilterStub {
  readonly value = input<string>('');
  readonly range = input<unknown>(null);
  readonly selectionChange = output<unknown>();
  readonly size = input<string>('');
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

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input<number>(1);
  readonly currentPageOverride = input<number>(1);
  readonly useQueryParams = input<boolean>(false);
  readonly showPageSize = input<boolean>(false);
  readonly showFirstLast = input<boolean>(false);
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-button', standalone: true, template: '' })
class ButtonStub {
  readonly buttonClick = output<void>();
  readonly variant = input<string>('');
  readonly size = input<string>('');
  readonly intent = input<string>('');
  readonly fullWidth = input<boolean>(false);
  readonly disabled = input<boolean>(false);
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

@Component({ selector: 'app-form-input', standalone: true, template: '' })
class FormInputStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-textarea', standalone: true, template: '' })
class FormTextareaStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly rows = input<number>(4);
  readonly textareaClass = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-multi-select', standalone: true, template: '' })
class MultiSelectStub {
  readonly options = input<unknown[]>([]);
  readonly value = input<string[]>([]);
  readonly placeholder = input<string>('');
  readonly width = input<string>('');
  readonly valueChange = output<string[]>();
}

describe('TermWordAdminComponent', () => {
  let fixture: ComponentFixture<TermWordAdminComponent>;
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

  const mockWordRows: GlossaryWordTableRow[] = Array.from({ length: 28 }, (_, i) => ({
    id: `w${i + 1}`,
    name: '用語用語',
    description: 'd',
    dateLabel: '2025/09/29 20:05',
    author: '名前名前',
    tags: ['タグタグ'],
  }));

  const mockRoute: Partial<ActivatedRoute> = {
    parent: {
      snapshot: { paramMap: convertToParamMap({ glossaryId: '1' }) },
      paramMap: of(convertToParamMap({ glossaryId: '1' })),
    } as never,
  };

  const mockWordsApi: Pick<GlossaryDictionaryWordsApiService, 'list'> = {
    list: vi.fn(async () => ({ data: mockWordRows, total: mockWordRows.length })),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TermWordAdminComponent],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: GlossaryDictionaryWordsApiService, useValue: mockWordsApi },
      ],
    })
      .overrideComponent(TermWordAdminComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            SearchInputStub,
            PeriodFilterStub,
            SelectStub,
            FormSortInputStub,
            PaginationStub,
            ButtonStub,
            IconButtonStub,
            SvgIconStub,
            TableListStub,
            TableListItemStub,
            FormInputStub,
            FormTextareaStub,
            ContextMenuStub,
            MultiSelectStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TermWordAdminComponent);
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態で選択がないこと', () => {
      expect(fixture.componentInstance.hasSelection()).toBe(false);
    });

    test('検索でpageIndexが1に戻ること', () => {
      fixture.componentInstance.pageIndex.set(2);
      fixture.componentInstance.onSearch('x');
      expect(fixture.componentInstance.pageIndex()).toBe(1);
    });
  });

  describe('DOM要素表示', () => {
    test('テーブルが描画されること', () => {
      expect(fixture.debugElement.query(By.directive(TableListStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('onToggleSelectAllでselectedWordIdsが更新されること', () => {
      fixture.componentInstance.onToggleSelectAll(true);
      expect(fixture.componentInstance.selectedWordIds().size).toBeGreaterThan(0);
      fixture.componentInstance.onToggleSelectAll(false);
      expect(fixture.componentInstance.selectedWordIds().size).toBe(0);
    });

    test('openPreviewでdialog.openが呼ばれること', () => {
      const row = fixture.componentInstance.pageSlice()[0]!;
      fixture.componentInstance.openPreview(row);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('openDeleteSelectedでdialog.openが呼ばれること', () => {
      fixture.componentInstance.onToggleSelectAll(true);
      fixture.componentInstance.openDeleteSelected();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });
});
