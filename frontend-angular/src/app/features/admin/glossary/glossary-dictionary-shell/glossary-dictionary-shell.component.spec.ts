import { CommonModule } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component, Pipe, PipeTransform, TemplateRef, input, output, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, ParamMap, Router, RouterOutlet } from '@angular/router';
import { Subject } from 'rxjs';
import { UiStore } from '@core/stores/ui.store';
import { TranslateService } from '@ngx-translate/core';
import { GlossaryTermsApiService } from '../services/glossary-terms-api.service';
import { GlossaryTermsMockService } from '../services/glossary-terms-mock.service';
import { GlossaryDictionaryShellComponent } from './glossary-dictionary-shell.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({ selector: 'app-icon-button', standalone: true, template: '' })
class IconButtonStub {
  readonly link = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly variant = input<string>('');
}

@Component({ selector: 'app-svg-icon', standalone: true, template: '' })
class SvgIconStub {
  readonly name = input<string>('');
}

@Component({ selector: 'app-context-menu', standalone: true, template: '' })
class ContextMenuStub {
  readonly menuTpl = input<TemplateRef<unknown> | null>(null);
  readonly customTrigger = input<TemplateRef<unknown> | null>(null);
  readonly panelClass = input<string>('');
  readonly menuMinWidth = input<string>('');
  readonly hasPaddingButton = input<boolean>(false);
}

@Component({ selector: 'app-tab', standalone: true, template: '' })
class TabStub {
  readonly tabs = input<unknown[]>([]);
  readonly activeTabId = input<string>('');
}

@Component({ selector: 'app-form-input', standalone: true, template: '' })
class FormInputStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly valueChange = output<string>();
}

@Component({ selector: 'app-form-textarea', standalone: true, template: '' })
class FormTextareaStub {
  readonly label = input<string>('');
  readonly value = input<string>('');
  readonly rows = input<number>(4);
  readonly badgeText = input<string>('');
  readonly textareaClass = input<string>('');
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

@Component({ selector: 'app-button', standalone: true, template: '' })
class ButtonStub {
  readonly variant = input<string>('');
  readonly size = input<string>('');
  readonly intent = input<string>('');
  readonly buttonClick = output<void>();
}

describe('GlossaryDictionaryShellComponent', () => {
  let fixture: ComponentFixture<GlossaryDictionaryShellComponent>;
  const routerEvents$ = new Subject<unknown>();
  const paramMap$ = new Subject<ParamMap>();

  const mockRouter: Pick<Router, 'events' | 'url' | 'navigateByUrl'> = {
    events: routerEvents$ as unknown as Router['events'],
    url: '/glossary/1/term-words',
    navigateByUrl: vi.fn().mockResolvedValue(true),
  };

  const mockTermsApi: Pick<GlossaryTermsApiService, 'getById' | 'update' | 'delete'> = {
    getById: vi.fn().mockResolvedValue({
      id: '1',
      name: 'Dict',
      definition: 'Def',
      tags: [],
      editedDate: new Date().toISOString(),
      creator: 'c',
      category: 'x',
      assistant: '',
    }),
    update: vi.fn().mockResolvedValue({
      id: '1',
      name: 'New',
      definition: 'Desc',
      tags: [],
      editedDate: new Date().toISOString(),
      creator: 'c',
      category: 'x',
      assistant: 'A',
    }),
    delete: vi.fn().mockResolvedValue({ id: '1' }),
  };

  const mockRoute: Pick<ActivatedRoute, 'paramMap'> = {
    paramMap: paramMap$ as unknown as ActivatedRoute['paramMap'],
  };

  const mockDialog: Pick<MatDialog, 'open' | 'closeAll'> = {
    open: vi.fn(),
    closeAll: vi.fn(),
  };

  const mockUiStore: Pick<UiStore, 'toggleMobileSidebar'> = {
    toggleMobileSidebar: vi.fn(),
  };

  const mockGlossary: Pick<GlossaryTermsMockService, 'assistantOptions'> = {
    assistantOptions: signal([{ label: 'A', value: 'assistant-a' }]),
  };

  const mockTranslate: Pick<TranslateService, 'instant' | 'currentLang' | 'onLangChange'> = {
    instant: vi.fn((key: string) => key),
    currentLang: 'ja',
    onLangChange: new Subject() as unknown as TranslateService['onLangChange'],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GlossaryDictionaryShellComponent],
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
        { provide: MatDialog, useValue: mockDialog },
        { provide: UiStore, useValue: mockUiStore },
        { provide: TranslateService, useValue: mockTranslate },
        { provide: GlossaryTermsApiService, useValue: mockTermsApi },
        { provide: GlossaryTermsMockService, useValue: mockGlossary },
      ],
    })
      .overrideComponent(GlossaryDictionaryShellComponent, {
        set: {
          imports: [
            CommonModule,
            FakeTranslatePipe,
            RouterOutlet,
            IconButtonStub,
            SvgIconStub,
            ContextMenuStub,
            TabStub,
            FormInputStub,
            FormTextareaStub,
            FormComboboxStub,
            ButtonStub,
          ],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(GlossaryDictionaryShellComponent);

    // initial param
    paramMap$.next({ get: (k: string) => (k === 'glossaryId' ? '1' : null) } as ParamMap);
    routerEvents$.next(new NavigationEnd(1, '/glossary/1/term-words', '/glossary/1/term-words'));

    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('dictionaryTitleがglossaryIdから解決されること', async () => {
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.dictionaryTitle()).toBe('Dict');
      expect(mockTermsApi.getById).toHaveBeenCalledWith('1');
    });

    test('dictionaryTabsがglossaryIdに応じて有効になること', () => {
      const tabs = fixture.componentInstance.dictionaryTabs();
      expect(tabs.every((t) => t.disabled === false)).toBe(true);
    });
  });

  describe('DOM要素表示', () => {
    test('タブが描画されること', () => {
      expect(fixture.debugElement.query(By.directive(TabStub))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('toggleSidebarでUiStoreが呼ばれること', () => {
      fixture.componentInstance.toggleSidebar();
      expect(mockUiStore.toggleMobileSidebar).toHaveBeenCalled();
    });

    test('openEditDictionaryでdialog.openが呼ばれること', () => {
      fixture.componentInstance.openEditDictionary();
      expect(mockDialog.open).toHaveBeenCalled();
    });

    test('saveEditDictionaryでtermsApi.update + closeAllが呼ばれること', async () => {
      fixture.componentInstance.editDictName.set('New');
      fixture.componentInstance.editDictDesc.set('Desc');
      fixture.componentInstance.editDictAssistants.set(['assistant-a']);
      await fixture.componentInstance.saveEditDictionary();
      expect(mockTermsApi.update).toHaveBeenCalled();
      expect(mockDialog.closeAll).toHaveBeenCalled();
    });
  });
});
