import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryUserAssistantsComponent } from './glossary-user-assistants.component';
import { UserGlossaryDictionaryAssistantsApiService } from './services/user-glossary-dictionary-assistants-api.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('GlossaryUserAssistantsComponent', () => {
  let fixture: ComponentFixture<GlossaryUserAssistantsComponent>;
  let component: GlossaryUserAssistantsComponent;

  const parentParamMap$ = new Subject<ReturnType<typeof convertToParamMap>>();

  const mockTranslate: Pick<TranslateService, 'currentLang' | 'instant' | 'onLangChange'> = {
    currentLang: 'ja',
    instant: vi.fn((key: string) => key),
    onLangChange: new Subject(),
  };

  const mockAssistantsApi: Pick<UserGlossaryDictionaryAssistantsApiService, 'list'> = {
    list: vi.fn(),
  };

  const mockRoute = {
    parent: {
      snapshot: { paramMap: convertToParamMap({ glossaryId: 'g-1' }) },
      paramMap: parentParamMap$.asObservable(),
    },
  } as unknown as ActivatedRoute;

  beforeEach(async () => {
    (mockAssistantsApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 'a-1',
          name: 'Bot A',
          description: 'desc',
          server: 'クラウド(一般)',
          model: 'gpt',
          category: 'カテゴリA',
          history: '10',
        },
        {
          id: 'a-2',
          name: 'Bot B',
          description: 'desc',
          server: 'ローカル',
          model: 'gpt',
          category: 'カテゴリB',
          history: '2',
        },
        {
          id: 'a-3',
          name: 'Bot C',
          description: 'desc',
          server: 'クラウド(一般)',
          model: 'gpt',
          category: 'カテゴリC',
          history: '1',
        },
      ],
      total: 3,
    });

    await TestBed.configureTestingModule({
      imports: [GlossaryUserAssistantsComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: UserGlossaryDictionaryAssistantsApiService, useValue: mockAssistantsApi },
      ],
    })
      .overrideComponent(GlossaryUserAssistantsComponent, {
        set: {
          imports: [FakeTranslatePipe],
          schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryUserAssistantsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期値が設定されていること', () => {
      expect(component.serverFilter()).toBeNull();
      expect(component.categoryFilter()).toBeNull();
      expect(component.sortField()).toBe('added');
      expect(component.sortOrder()).toBe('desc');
      expect(component.pageIndex()).toBe(1);
      expect(component.totalPages()).toBe(1);
      expect(component.countDisplay()).toBe('');
    });

    test('ngOnInitで初期のglossaryIdから一覧取得すること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      expect(mockAssistantsApi.list).toHaveBeenCalledWith('g-1');
      expect(component.assistantRows().length).toBe(3);
      expect(component.totalPages()).toBe(2); // pageSize=2
      expect(component.pageSlice().length).toBe(2);
      expect(component.countDisplay()).toContain('ADMIN.GLOSSARY.WORD_PAGE_COUNT');
    });

    test('親ルートのglossaryId変更で再取得すること', async () => {
      component.ngOnInit();
      parentParamMap$.next(convertToParamMap({ glossaryId: 'g-2' }));
      await fixture.whenStable();
      expect(mockAssistantsApi.list).toHaveBeenCalledWith('g-2');
    });

    test('サーバーフィルターで絞り込みできること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onServerChange('server2');
      expect(component.filteredRows().every((r) => r.server.includes('一般'))).toBe(true);
      expect(component.pageIndex()).toBe(1);
    });

    test('ページ変更できること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onPageChange(2);
      expect(component.pageIndex()).toBe(2);
      expect(component.pageSlice().length).toBe(1);
    });
  });

  describe('DOM要素表示', () => {
    test('データがあるときに行が描画されること', async () => {
      component.ngOnInit();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const items = fixture.debugElement.queryAll(By.css('app-table-list-item'));
      expect(items.length).toBeGreaterThan(1); // header + rows
    });

    test('データがないときにNO_DATAが表示されること', async () => {
      (mockAssistantsApi.list as unknown as ReturnType<typeof vi.fn>).mockReset();
      (mockAssistantsApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
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
    test('フィルター変更でページが1に戻ること', async () => {
      component.ngOnInit();
      await fixture.whenStable();
      component.onPageChange(2);
      expect(component.pageIndex()).toBe(2);

      component.onServerChange('all');
      expect(component.pageIndex()).toBe(1);

      component.onCategoryChange('cat-a');
      expect(component.pageIndex()).toBe(1);
    });
  });
});
