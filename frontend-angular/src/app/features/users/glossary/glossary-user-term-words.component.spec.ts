import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryUserTermWordsComponent } from './glossary-user-term-words.component';
import { UserGlossaryDictionaryWordsApiService } from './services/user-glossary-dictionary-words-api.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('GlossaryUserTermWordsComponent', () => {
  let fixture: ComponentFixture<GlossaryUserTermWordsComponent>;
  let component: GlossaryUserTermWordsComponent;

  const parentParamMap$ = new Subject<ReturnType<typeof convertToParamMap>>();

  const mockTranslate: Pick<TranslateService, 'currentLang' | 'instant' | 'onLangChange'> = {
    currentLang: 'ja',
    instant: vi.fn((key: string) => key),
    onLangChange: new Subject(),
  };

  const mockWordsApi: Pick<UserGlossaryDictionaryWordsApiService, 'list'> = {
    list: vi.fn(),
  };

  const mockDialog: Pick<MatDialog, 'open' | 'closeAll'> = {
    open: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockRoute = {
    parent: {
      snapshot: { paramMap: convertToParamMap({ glossaryId: 'g-1' }) },
      paramMap: parentParamMap$.asObservable(),
    },
  } as unknown as ActivatedRoute;

  beforeEach(async () => {
    (mockWordsApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'w-1',
          name: 'Word A',
          description: 'Desc A',
          author: 'Alice',
          dateLabel: '2026/01/01',
          tags: ['タグA', 'タグB'],
        },
        {
          id: 'w-2',
          name: 'Word B',
          description: 'Desc B',
          author: 'Bob',
          dateLabel: '2026/01/02',
          tags: ['タグC'],
        },
        {
          id: 'w-3',
          name: 'Word C',
          description: 'Desc C',
          author: 'Carol',
          dateLabel: '2026/01/03',
          tags: ['タグA'],
        },
      ],
      total: 3,
    });

    await TestBed.configureTestingModule({
      imports: [GlossaryUserTermWordsComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: UserGlossaryDictionaryWordsApiService, useValue: mockWordsApi },
        { provide: MatDialog, useValue: mockDialog },
      ],
    })
      .overrideComponent(GlossaryUserTermWordsComponent, {
        set: {
          imports: [FakeTranslatePipe],
          schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryUserTermWordsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期値が設定されていること', () => {
      expect(component.searchQuery()).toBe('');
      expect(component.tagFilter()).toBeNull();
      expect(component.sortField()).toBe('updated');
      expect(component.sortOrder()).toBe('desc');
      expect(component.pageIndex()).toBe(1);
      expect(component.countDisplay()).toBe('');
      expect(component.totalPages()).toBe(1);
    });

    test('ngOnInitで初期のglossaryIdから一覧取得すること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      expect(mockWordsApi.list).toHaveBeenCalledWith('g-1');
      expect(component.wordRows().length).toBe(3);
      expect(component.totalPages()).toBe(1);
      expect(component.pageSlice().length).toBe(3);
      expect(component.countDisplay()).toContain('ADMIN.GLOSSARY.WORD_PAGE_COUNT');
    });

    test('検索で絞り込みできること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onSearch('word b');
      expect(component.filteredRows().length).toBe(1);
      expect(component.filteredRows()[0]?.name).toBe('Word B');
      expect(component.pageIndex()).toBe(1);
    });

    test('タグフィルターで絞り込みできること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onTagChange('tag-a'); // label: タグA
      expect(component.filteredRows().length).toBe(3);
      expect(component.pageIndex()).toBe(1);
    });
  });

  describe('DOM要素表示', () => {
    test('データがあるときに行が描画されること', async () => {
      component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Word A');
    });

    test('データがないときにNO_DATAが表示されること', async () => {
      (mockWordsApi.list as unknown as ReturnType<typeof vi.fn>).mockReset();
      (mockWordsApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [],
        total: 0,
      });
      component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('COMMON.NO_DATA');
    });
  });

  describe('DOM要素イベント', () => {
    test('openPreviewでダイアログが開くこと', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      const row = component.filteredRows()[0]!;

      component.openPreview(row);

      expect(component.previewRow()).toEqual(row);
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('closeDialogsでcloseAllが呼ばれること', () => {
      component.closeDialogs();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });

    test('ページ変更できること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onPageChange(2);
      expect(component.pageIndex()).toBe(2);
    });
  });
});
