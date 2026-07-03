import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Pipe, PipeTransform, input, output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import type { TabItem } from 'src/types/tab.type';
import { AdminGlossaryComponent } from './glossary.component';

@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({
  selector: 'app-glossary-terms-tab',
  standalone: true,
  template: '<div data-testid="terms-tab"></div>',
})
class GlossaryTermsTabStub {}

@Component({
  selector: 'app-glossary-tags-tab',
  standalone: true,
  template: '<div data-testid="tags-tab"></div>',
})
class GlossaryTagsTabStub {}

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <div data-testid="page-header">
      <button
        type="button"
        data-testid="switch-terms"
        aria-label="Switch to terms tab"
        (click)="tabChange.emit({ id: 'terms', label: 't' })"
      >
        Terms
      </button>
      <button
        type="button"
        data-testid="switch-tags"
        aria-label="Switch to tags tab"
        (click)="tabChange.emit({ id: 'tags', label: 't' })"
      >
        Tags
      </button>
    </div>
  `,
})
class PageHeaderStub {
  readonly tabs = input<TabItem[]>([]);
  readonly activeTabId = input<string>('');
  readonly tabChange = output<TabItem>();
  readonly title = input<string>('');
  readonly titleKey = input<string>('');
  readonly showSidebarToggle = input<boolean>(false);
  readonly showActions = input<boolean>(false);
  readonly showLanguageToggle = input<boolean>(false);
  readonly showBackButton = input<boolean>(false);
}

describe('AdminGlossaryComponent', () => {
  let fixture: ComponentFixture<AdminGlossaryComponent>;
  const langChange$ = new Subject<unknown>();

  const mockTranslate: Pick<TranslateService, 'instant' | 'onLangChange' | 'currentLang'> = {
    instant: vi.fn((key: string) => key),
    onLangChange: langChange$ as unknown as TranslateService['onLangChange'],
    currentLang: 'ja',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminGlossaryComponent],
      providers: [
        provideRouter([{ path: '**', component: AdminGlossaryComponent }]),
        { provide: TranslateService, useValue: mockTranslate },
      ],
    })
      .overrideComponent(AdminGlossaryComponent, {
        set: {
          imports: [PageHeaderStub, FakeTranslatePipe, GlossaryTermsTabStub, GlossaryTagsTabStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminGlossaryComponent);
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  describe('初期値・ゲッター', () => {
    test('初期タブがtermsであること', () => {
      expect(fixture.componentInstance.activeTabId()).toBe('terms');
    });

    test('tabsが翻訳キーで生成されること', () => {
      const tabs = fixture.componentInstance.tabs();
      expect(tabs.map((t) => t.id)).toEqual(['terms', 'tags']);
      expect(mockTranslate.instant).toHaveBeenCalledWith('ADMIN.GLOSSARY.TAB_TERMS');
      expect(mockTranslate.instant).toHaveBeenCalledWith('ADMIN.GLOSSARY.TAB_TAGS');
    });
  });

  describe('DOM要素表示', () => {
    test('初期状態でtermsタブが表示されること', () => {
      expect(fixture.debugElement.query(By.css('[data-testid="terms-tab"]'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('[data-testid="tags-tab"]'))).toBeNull();
    });

    test('activeTabIdがtagsの時にtagsタブが表示されること', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('[data-testid="terms-tab"]'))).toBeNull();
      expect(fixture.debugElement.query(By.css('[data-testid="tags-tab"]'))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('tabChangeイベントでactiveTabIdが更新されること', async () => {
      const tagsBtn = fixture.debugElement.query(By.css('[data-testid="switch-tags"]'));
      tagsBtn.triggerEventHandler('click');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.componentInstance.activeTabId()).toBe('tags');
    });
  });
});
