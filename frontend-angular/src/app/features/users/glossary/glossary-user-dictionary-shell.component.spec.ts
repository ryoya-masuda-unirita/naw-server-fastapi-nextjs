import { CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import {
  ActivatedRoute,
  convertToParamMap,
  NavigationEnd,
  Router,
  type Event,
} from '@angular/router';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryUserDictionaryShellComponent } from './glossary-user-dictionary-shell.component';
import { UiStore } from '@core/stores/ui.store';
import { UserGlossaryTermsApiService } from './services/user-glossary-terms-api.service';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('GlossaryUserDictionaryShellComponent', () => {
  let fixture: ComponentFixture<GlossaryUserDictionaryShellComponent>;
  let component: GlossaryUserDictionaryShellComponent;

  const routeParamMap$ = new Subject<ReturnType<typeof convertToParamMap>>();
  const routerEvents$ = new Subject<Event>();

  const mockRoute = {
    paramMap: routeParamMap$.asObservable(),
  } as unknown as ActivatedRoute;

  const mockRouter = {
    events: routerEvents$.asObservable(),
    url: '/glossary/g-1/term-words',
  } as unknown as Router;

  const mockUiStore: Pick<UiStore, 'toggleMobileSidebar'> = {
    toggleMobileSidebar: vi.fn(),
  };

  const mockTermsApi: Pick<UserGlossaryTermsApiService, 'getById'> = {
    getById: vi.fn(),
  };

  const mockTranslate: Pick<TranslateService, 'instant'> = {
    instant: vi.fn((key: string) => key),
  };

  beforeEach(async () => {
    (mockTermsApi.getById as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'g-1',
      name: 'Term 1',
      definition: 'def',
      assistant: null,
      editedDate: '2026-01-01T00:00:00.000Z',
    });

    await TestBed.configureTestingModule({
      imports: [GlossaryUserDictionaryShellComponent],
      providers: [
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: Router, useValue: mockRouter },
        { provide: UiStore, useValue: mockUiStore },
        { provide: UserGlossaryTermsApiService, useValue: mockTermsApi },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(GlossaryUserDictionaryShellComponent, {
        set: {
          imports: [FakeTranslatePipe],
          schemas: [CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryUserDictionaryShellComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('glossaryIdが空のとき辞書データがnullになること', async () => {
      routeParamMap$.next(convertToParamMap({ glossaryId: '' }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.dictionaryTerm()).toBeNull();
      expect(component.dictionaryTitle()).toBe('');
      expect(component.dictionaryTabs().every((t) => t.disabled)).toBe(true);
    });

    test('glossaryIdがあるときgetByIdが呼ばれ、タイトルが反映されること', async () => {
      routeParamMap$.next(convertToParamMap({ glossaryId: 'g-1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(mockTermsApi.getById).toHaveBeenCalledWith('g-1');
      expect(component.dictionaryTitle()).toBe('Term 1');
      expect(component.dictionaryTabs().every((t) => !t.disabled)).toBe(true);
    });

    test('URLにassistantsが含まれるとアクティブタブがassistantsになること', async () => {
      (mockRouter as unknown as { url: string }).url = '/glossary/g-1/assistants';
      routerEvents$.next(new NavigationEnd(1, mockRouter.url, mockRouter.url));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.activeTabId()).toBe('assistants');
    });
  });

  describe('DOM要素表示', () => {
    test('タイトルが表示されること', async () => {
      routeParamMap$.next(convertToParamMap({ glossaryId: 'g-1' }));
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Term 1');
    });
  });

  describe('DOM要素イベント', () => {
    test('toggleSidebarでUiStoreが呼ばれること', () => {
      component.toggleSidebar();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalled();
    });
  });
});
