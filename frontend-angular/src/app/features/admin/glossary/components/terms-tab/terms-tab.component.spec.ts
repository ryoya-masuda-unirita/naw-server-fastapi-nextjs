import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, input, output, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryTermsMockService } from '../../services/glossary-terms-mock.service';
import { GlossaryTermsApiService } from '../../services/glossary-terms-api.service';
import { GlossaryTermsTabComponent } from './terms-tab.component';
import type { GlossaryItem } from '@app-types/admin/glossary.types';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-pagination', standalone: true, template: '' })
class PaginationStub {
  readonly totalPages = input<number>(1);
  readonly currentPageOverride = input<number>(1);
  readonly useQueryParams = input<boolean>(false);
  readonly showPageSize = input<boolean>(false);
  readonly showFirstLast = input<boolean>(false);
  readonly showPageNumbers = input<boolean>(false);
  readonly countDisplay = input<string>('');
  readonly pageChange = output<number>();
}

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly id = input<string>('');
  readonly size = input<string>('');
  readonly fields = input<unknown[]>([]);
  readonly placeholder = input<string>('');
  readonly selectedField = input<string | null>(null);
  readonly selectedFieldChange = output<string | null>();
  readonly selectedOrder = input<string>('desc');
  readonly selectedOrderChange = output<string>();
}

@Component({
  selector: 'app-button',
  standalone: true,
  template:
    '<button type="button" aria-label="button" (click)="buttonClick.emit()">Button</button>',
})
class ButtonStub {
  readonly buttonClick = output<void>();
  readonly disabled = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
  readonly variant = input<string>('');
  readonly size = input<string>('');
  readonly intent = input<string>('');
  readonly iconPosition = input<string>('');
  readonly classProps = input<string>('');
}

@Component({ selector: 'app-form-input', standalone: true, template: '' })
class FormInputStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-textarea', standalone: true, template: '' })
class FormTextareaStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly supportText = input<string>('');
  readonly badgeText = input<string>('');
  readonly rows = input<number>(4);
  readonly textareaClass = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly error = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-combobox', standalone: true, template: '' })
class FormComboboxStub {
  readonly label = input<string>('');
  readonly badgeText = input<string>('');
  readonly supportText = input<string>('');
  readonly placeholder = input<string>('');
  readonly searchPlaceholder = input<string>('');
  readonly options = input<unknown[]>([]);
  readonly value = input<string[] | null>(null);
  readonly valueChange = output<string[]>();
}

@Component({ selector: 'app-search-input', standalone: true, template: '' })
class SearchInputStub {
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  readonly id = input<string>('');
  readonly size = input<string>('');
  readonly maxLength = input<number | null>(null);
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class MatIconStub {
  readonly icon = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

describe('GlossaryTermsTabComponent', () => {
  let fixture: ComponentFixture<GlossaryTermsTabComponent>;
  const langChange$ = new Subject<unknown>();

  const mockDialog: Pick<MatDialog, 'open' | 'closeAll'> = {
    open: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockRouter: Pick<Router, 'navigateByUrl'> = {
    navigateByUrl: vi.fn(async () => true),
  };

  const mockTranslate: Pick<TranslateService, 'instant' | 'onLangChange' | 'currentLang'> = {
    instant: vi.fn((key: string) => key),
    onLangChange: langChange$ as unknown as TranslateService['onLangChange'],
    currentLang: 'ja',
  };

  const itemsSig = signal([
    {
      id: '1',
      name: 'Alpha',
      definition: 'Def',
      tags: ['a'],
      editedDate: new Date('2025-01-01'),
      creator: 'User',
      category: 'Cat',
      assistant: 'Asst',
    },
    {
      id: '2',
      name: 'Beta',
      definition: 'Other',
      tags: ['b'],
      editedDate: new Date('2025-01-02'),
      creator: 'User2',
      category: 'Cat2',
      assistant: 'Asst2',
    },
  ]);
  const assistantOptionsSig = signal([{ label: 'A', value: 'assistant-a' }]);

  const mockGlossaryService: Pick<GlossaryTermsMockService, 'items' | 'assistantOptions'> = {
    items: itemsSig.asReadonly(),
    assistantOptions: assistantOptionsSig,
  };

  const mockGlossaryApi: Pick<GlossaryTermsApiService, 'list' | 'create' | 'delete'> = {
    list: vi.fn(async () => ({
      data: itemsSig().map((t) => ({
        ...t,
        editedDate: t.editedDate.toISOString(),
      })),
      total: itemsSig().length,
      page: 1,
      size: 1000,
    })) as never,
    create: vi.fn(async () => ({
      ...itemsSig()[0]!,
      editedDate: new Date().toISOString(),
    })) as never,
    delete: vi.fn(async () => ({ id: '1' })) as never,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlossaryTermsTabComponent],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: Router, useValue: mockRouter },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: GlossaryTermsMockService, useValue: mockGlossaryService },
        { provide: GlossaryTermsApiService, useValue: mockGlossaryApi },
      ],
    })
      .overrideComponent(GlossaryTermsTabComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            PaginationStub,
            FormSortInputStub,
            ButtonStub,
            FormInputStub,
            FormTextareaStub,
            FormComboboxStub,
            SearchInputStub,
            MatIconModule,
            MatIconStub,
            SvgIconStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryTermsTabComponent);
    fixture.detectChanges();
    await Promise.resolve(); // allow initial refresh() to resolve
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('filteredItemsが初期状態で全件であること', () => {
      expect(fixture.componentInstance.filteredItems().length).toBe(2);
    });

    test('searchInputで絞り込みされること', () => {
      fixture.componentInstance.onSearchQuery('alpha');
      fixture.detectChanges();
      expect(fixture.componentInstance.filteredItems().length).toBe(1);
    });
  });

  describe('DOM要素表示', () => {
    test('検索入力が描画されること', () => {
      expect(fixture.debugElement.query(By.directive(SearchInputStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('onAddTermでdialog.openが呼ばれること', () => {
      fixture.componentInstance.onAddTerm();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('confirmAddTermでcreateが呼ばれdialogが閉じること', async () => {
      fixture.componentInstance.newTermName.set('Name');
      fixture.componentInstance.newTermDescription.set('Desc');
      fixture.componentInstance.newTermAssistant.set(['assistant-a']);
      fixture.componentInstance.confirmAddTerm();

      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0)); // allow promise chain + .finally() to run
      fixture.detectChanges();

      expect(mockGlossaryApi.create).toHaveBeenCalled();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('onViewDictionaryでnavigateByUrlが呼ばれること', () => {
      const item = mockGlossaryService.items()[0] as GlossaryItem;
      fixture.componentInstance.onViewDictionary(item);
      expect(mockRouter.navigateByUrl).toHaveBeenCalled();
    });

    test('closeDialogでdialog.closeAllが呼ばれること', () => {
      fixture.componentInstance.closeDialog();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });
  });
});
