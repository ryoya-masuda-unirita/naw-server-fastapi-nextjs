import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AdminLibraryComponent } from './library-list.component';
import { AuthStore } from '@core/stores/auth.store';
import type { TabItem } from 'src/types/tab.type';

// --------------- Fake TranslatePipe ---------------
@Pipe({ name: 'translate', standalone: true, pure: false })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// --------------- Mock TranslateService ---------------
const langChangeSubject = new Subject<{ lang: string }>();
const mockTranslateService = {
  instant: vi.fn((key: string) => key),
  getCurrentLang: vi.fn(() => 'ja'),
  onLangChange: langChangeSubject.asObservable(),
  onTranslationChange: { subscribe: vi.fn() },
  onDefaultLangChange: { subscribe: vi.fn() },
};

// --------------- Mock AuthStore ---------------
const isAdminSignal = signal(true);
const mockAuthStore = {
  isAdmin: isAdminSignal,
};

// --------------- Stubs ---------------
@Component({ selector: 'app-page-header', standalone: true, template: '' })
class PageHeaderStub {
  title = input<string>('');
  titleKey = input<string>('');
  showSidebarToggle = input<boolean>(false);
  showActions = input<boolean>(false);
  showLanguageToggle = input<boolean>(false);
  showBackButton = input<boolean>(false);
  tabs = input<TabItem[]>([]);
  activeTabId = input<string>('');
  tabChange = output<TabItem>();
}

@Component({ selector: 'app-library-content-tab', standalone: true, template: '' })
class ContentTabStub {}

@Component({ selector: 'app-library-tags-tab', standalone: true, template: '' })
class TagsTabStub {}

// ================================================================
describe('AdminLibraryComponent', () => {
  let fixture: ComponentFixture<AdminLibraryComponent>;
  let component: AdminLibraryComponent;

  beforeEach(async () => {
    vi.clearAllMocks();
    isAdminSignal.set(true);
    mockTranslateService.instant.mockImplementation((key: string) => key);

    await TestBed.configureTestingModule({
      imports: [AdminLibraryComponent],
      providers: [
        provideRouter([{ path: '**', component: AdminLibraryComponent }]),
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: AuthStore, useValue: mockAuthStore },
      ],
    })
      .overrideComponent(AdminLibraryComponent, {
        set: {
          imports: [FakeTranslatePipe, PageHeaderStub, ContentTabStub, TagsTabStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminLibraryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.clearAllMocks());

  // ================================================================
  describe('初期値・ゲッター', () => {
    test('初期状態でactiveTabIdが"contents"であること', () => {
      expect(component.activeTabId()).toBe('contents');
    });

    test('isAdminがtrueのときtabsが2つ返されること', () => {
      expect(component.tabs().length).toBe(2);
    });

    test('tabsの最初のアイテムのidが"contents"であること', () => {
      expect(component.tabs()[0].id).toBe('contents');
    });

    test('tabsの2番目のアイテムのidが"tags"であること', () => {
      expect(component.tabs()[1].id).toBe('tags');
    });

    test('isAdminがfalseのときtabsが空配列を返すこと', () => {
      isAdminSignal.set(false);
      expect(component.tabs().length).toBe(0);
    });

    test('isAdminがfalseかつURLがtab=tagsのときactiveTabIdがcontentsになること', async () => {
      isAdminSignal.set(false);
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.activeTabId()).toBe('contents');
    });

    test('onTabChangeでactiveTabIdが更新されること', async () => {
      component.onTabChange({ id: 'tags', label: 'タグ' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.activeTabId()).toBe('tags');
    });

    test('onTabChangeで"contents"に戻せること', async () => {
      component.onTabChange({ id: 'tags', label: 'タグ' });
      component.onTabChange({ id: 'contents', label: 'コンテンツ' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.activeTabId()).toBe('contents');
    });
  });

  // ================================================================
  describe('DOM要素表示', () => {
    test('app-page-headerが表示されること', () => {
      const el = fixture.debugElement.query(By.css('app-page-header'));
      expect(el).toBeTruthy();
    });

    test('初期状態でapp-library-content-tabが表示されること', () => {
      const el = fixture.debugElement.query(By.css('app-library-content-tab'));
      expect(el).toBeTruthy();
    });

    test('初期状態でapp-library-tags-tabが表示されないこと', () => {
      const el = fixture.debugElement.query(By.css('app-library-tags-tab'));
      expect(el).toBeNull();
    });

    test('isAdminがfalseかつURLがtab=tagsのときapp-library-content-tabが表示されること', async () => {
      isAdminSignal.set(false);
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-library-content-tab'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('app-library-tags-tab'))).toBeNull();
    });

    test('activeTabIdが"tags"のときapp-library-tags-tabが表示されること', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      fixture.detectChanges();
      const el = fixture.debugElement.query(By.css('app-library-tags-tab'));
      expect(el).toBeTruthy();
    });

    test('activeTabIdが"tags"のときapp-library-content-tabが非表示になること', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      fixture.detectChanges();
      const el = fixture.debugElement.query(By.css('app-library-content-tab'));
      expect(el).toBeNull();
    });

    test('app-page-headerにtabsが渡されること', () => {
      const header = fixture.debugElement.query(By.css('app-page-header'));
      expect(header.componentInstance.tabs()).toEqual(component.tabs());
    });

    test('app-page-headerにactiveTabIdが渡されること', () => {
      const header = fixture.debugElement.query(By.css('app-page-header'));
      expect(header.componentInstance.activeTabId()).toBe('contents');
    });
  });

  // ================================================================
  describe('DOM要素イベント', () => {
    test('app-page-headerのtabChangeイベントでonTabChangeが呼ばれること', async () => {
      const header = fixture.debugElement.query(By.css('app-page-header'));
      const tabItem: TabItem = { id: 'tags', label: 'タグ' };
      header.componentInstance.tabChange.emit(tabItem);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.activeTabId()).toBe('tags');
    });

    test('tabChangeイベント後にapp-library-tags-tabが表示されること', async () => {
      const header = fixture.debugElement.query(By.css('app-page-header'));
      header.componentInstance.tabChange.emit({ id: 'tags', label: 'タグ' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-library-tags-tab'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('app-library-content-tab'))).toBeNull();
    });

    test('tabChangeで"contents"に切り替えるとapp-library-content-tabが再表示されること', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=tags');
      fixture.detectChanges();
      const header = fixture.debugElement.query(By.css('app-page-header'));
      header.componentInstance.tabChange.emit({ id: 'contents', label: 'コンテンツ' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('app-library-content-tab'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('app-library-tags-tab'))).toBeNull();
    });
  });
});
