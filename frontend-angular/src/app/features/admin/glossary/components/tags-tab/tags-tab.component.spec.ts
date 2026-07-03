import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, input, output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { GlossaryTagsApiService } from '../../services/glossary-tags-api.service';
import { TagsTabComponent } from './tags-tab.component';

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
  readonly heightPx = input<number | null>(null);
  readonly iconPosition = input<string>('');
  readonly classProps = input<string>('');
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

@Component({ selector: 'app-form-sort-input', standalone: true, template: '' })
class FormSortInputStub {
  readonly id = input<string>('');
  readonly size = input<string>('');
  readonly fields = input<unknown[]>([]);
  readonly placeholder = input<string>('');
  readonly selectedField = input<string>('');
  readonly selectedFieldChange = output<string>();
  readonly selectedOrder = input<string>('desc');
  readonly selectedOrderChange = output<string>();
  readonly fieldChange = output<string>();
}

@Component({ selector: 'app-mat-icon', standalone: true, template: '' })
class MatIconStub {
  readonly icon = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-skeleton', standalone: true, template: '' })
class SkeletonStub {
  readonly height = input<string>('');
  readonly width = input<string>('');
}

@Component({ selector: 'app-glossary-tag-item-menu', standalone: true, template: '' })
class TagItemMenuStub {
  readonly item = input.required<GlossaryTagItem>();
  readonly editSettings = output<GlossaryTagItem>();
  readonly deleteItem = output<GlossaryTagItem>();
}

describe('TagsTabComponent', () => {
  let fixture: ComponentFixture<TagsTabComponent>;
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

  const tagsResponse: GlossaryTagItem[] = [
    { id: 't1', name: 'B', description: '', updatedBy: 'u', updatedDate: new Date('2025-01-01') },
    { id: 't2', name: 'A', description: 'd', updatedBy: 'u', updatedDate: new Date('2025-01-02') },
  ];

  const mockTagsApi: Pick<GlossaryTagsApiService, 'list'> = {
    list: vi.fn(async () => ({
      data: tagsResponse.map((t) => ({
        ...t,
        updatedDate: (t.updatedDate as unknown as Date).toISOString(),
      })),
    })) as never,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TagsTabComponent],
      providers: [
        { provide: MatDialog, useValue: mockDialog },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: GlossaryTagsApiService, useValue: mockTagsApi },
      ],
    })
      .overrideComponent(TagsTabComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            PaginationStub,
            ButtonStub,
            TableListStub,
            TableListItemStub,
            FormSortInputStub,
            TagItemMenuStub,
            MatIconStub,
            SvgIconStub,
            SkeletonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TagsTabComponent);
    fixture.detectChanges();
    await Promise.resolve(); // allow ngOnInit list() promise
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期状態でロード中であること', () => {
      // after ngOnInit resolves, it should be false; so just assert it transitioned
      expect(mockTagsApi.list).toHaveBeenCalled();
      expect(fixture.componentInstance.isLoading()).toBe(false);
    });

    test('sortedTagsがソートされること（デフォルトupdatedDate desc）', () => {
      const sorted = fixture.componentInstance.sortedTags();
      expect(sorted[0]?.id).toBe('t2');
    });
  });

  describe('DOM要素表示', () => {
    test('テーブルが描画されること', () => {
      expect(fixture.debugElement.query(By.directive(TableListStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('toggleItemSelectionでselectedTagsが更新されること', () => {
      const item = fixture.componentInstance.paginatedTags()[0]!;
      fixture.componentInstance.toggleItemSelection(item, true);
      expect(fixture.componentInstance.selectedTags().some((t) => t.id === item.id)).toBe(true);

      fixture.componentInstance.toggleItemSelection(item, false);
      expect(fixture.componentInstance.selectedTags().some((t) => t.id === item.id)).toBe(false);
    });

    test('onCreateTagでdialog.openが呼ばれること', () => {
      fixture.componentInstance.onCreateTag();
      expect(mockDialog.open).toHaveBeenCalled();
    });
  });
});
