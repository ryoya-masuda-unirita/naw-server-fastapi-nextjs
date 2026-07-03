import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryUserListComponent } from './glossary-user-list.component';
import { UserGlossaryTermsApiService } from './services/user-glossary-terms-api.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('GlossaryUserListComponent', () => {
  let fixture: ComponentFixture<GlossaryUserListComponent>;
  let component: GlossaryUserListComponent;

  const mockTranslate: Pick<TranslateService, 'currentLang' | 'instant' | 'onLangChange'> = {
    currentLang: 'ja',
    instant: vi.fn((key: string) => key),
    onLangChange: new Subject(),
  };

  const mockRouter: Pick<Router, 'navigateByUrl'> = {
    navigateByUrl: vi.fn(),
  };

  const mockTermsApi: Pick<UserGlossaryTermsApiService, 'list'> = {
    list: vi.fn(),
  };

  beforeEach(async () => {
    (mockTermsApi.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        {
          id: 't-1',
          name: 'Apple',
          definition: 'A fruit',
          assistant: 'Bot A',
          editedDate: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 't-2',
          name: 'Banana',
          definition: 'Yellow fruit',
          assistant: null,
          editedDate: '2026-01-02T00:00:00.000Z',
        },
      ],
      total: 2,
      page: 1,
      size: 1000,
    });

    await TestBed.configureTestingModule({
      imports: [GlossaryUserListComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
        { provide: Router, useValue: mockRouter },
        { provide: UserGlossaryTermsApiService, useValue: mockTermsApi },
      ],
    })
      .overrideComponent(GlossaryUserListComponent, {
        set: {
          imports: [FakeTranslatePipe],
          schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryUserListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期表示で一覧取得し、ローディングが解除されること', () => {
      expect(mockTermsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 1000,
          q: undefined,
          sortField: 'updatedAt',
          sortOrder: 'desc',
        }),
      );
      expect(component.isLoading()).toBe(false);
      expect(component.filteredItems().length).toBe(2);
      expect(component.totalPages()).toBe(1);
      expect(component.countDisplay()).toContain('ADMIN.GLOSSARY.WORD_PAGE_COUNT');
    });

    test('検索で絞り込みできること', () => {
      component.onSearchQuery('banana');
      expect(component.filteredItems().length).toBe(1);
      expect(component.filteredItems()[0]?.name).toBe('Banana');
      expect(component.currentPage()).toBe(1);
    });

    test('ソートフィールドがtermのとき名前順でソートされること', () => {
      component.sortField.set('term');
      component.sortOrder.set('asc');
      const names = component.filteredItems().map((x) => x.name);
      expect(names).toEqual(['Apple', 'Banana']);
    });
  });

  describe('DOM要素表示', () => {
    test('ローディング終了後にカードが描画されること', () => {
      const cards = fixture.debugElement.queryAll(By.css('.text-h2'));
      expect(cards.length).toBeGreaterThan(0);
      expect(fixture.nativeElement.textContent).toContain('Apple');
    });
  });

  describe('DOM要素イベント', () => {
    test('onViewで詳細へ遷移すること', () => {
      component.onView(component.filteredItems()[0]!);
      expect(mockRouter.navigateByUrl).toHaveBeenCalled();
    });

    test('ページ変更できること', () => {
      component.onPageChange(2);
      expect(component.currentPage()).toBe(2);
    });
  });
});
