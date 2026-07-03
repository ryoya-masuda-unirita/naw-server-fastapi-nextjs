import { Component, input, output, Pipe, PipeTransform, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { TabItem } from '@app-types/tab.type';
import { AuthStore } from '@core/stores/auth.store';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AdminAssistantListComponent } from './assistant-list.component';

@Pipe({ name: 'translate', standalone: true })
class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

@Component({
  selector: 'app-assistant-tab',
  standalone: true,
  template: '<div data-testid="assistant-tab"></div>',
})
class AssistantTabStub {}

@Component({
  selector: 'app-category-tab',
  standalone: true,
  template: '<div data-testid="category-tab"></div>',
})
class CategoryTabStub {}

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: '',
})
class PageHeaderStub {
  title = input<string>();
  titleKey = input<string>();
  showSidebarToggle = input<boolean>();
  showActions = input<boolean>();
  showLanguageToggle = input<boolean>();
  showBackButton = input<boolean>();
  tabs = input<TabItem[]>();
  activeTabId = input<string>();
  tabChange = output<TabItem>();
}

describe('AdminAssistantListComponent', () => {
  let component: AdminAssistantListComponent;
  let fixture: ComponentFixture<AdminAssistantListComponent>;

  const onLangChange$ = new Subject<any>();
  const mockTranslateService = {
    onLangChange: onLangChange$.asObservable(),
    getCurrentLang: vi.fn().mockReturnValue('ja'),
    instant: vi.fn((key: string) => key),
  };

  const isAdmin = signal(true);
  const mockAuthStore = {
    isAdmin,
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminAssistantListComponent],
      providers: [
        provideRouter([{ path: '**', component: AdminAssistantListComponent }]),
        { provide: TranslateService, useValue: mockTranslateService },
        { provide: AuthStore, useValue: mockAuthStore },
      ],
    })
      .overrideComponent(AdminAssistantListComponent, {
        set: {
          imports: [FakeTranslatePipe, AssistantTabStub, CategoryTabStub, PageHeaderStub],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminAssistantListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初期値・ゲッター', () => {
    test('初期状態で activeTabId が assistant であること', () => {
      expect(component.activeTabId()).toBe('assistant');
    });

    test('管理者でない場合、tabs が空配列であること', () => {
      isAdmin.set(false);
      fixture.detectChanges();
      expect(component.tabs()).toEqual([]);
    });

    test('管理者の場合、tabs にアシスタント一覧とカテゴリ管理が含まれること', () => {
      isAdmin.set(true);
      fixture.detectChanges();
      const tabs = component.tabs();
      expect(tabs.length).toBe(2);
      expect(tabs[0].id).toBe('assistant');
      expect(tabs[0].label).toBe('ADMIN.ASSISTANT.TAB_ASSISTANT_LIST');
      expect(tabs[1].id).toBe('assistant-category');
      expect(tabs[1].label).toBe('ADMIN.ASSISTANT.TAB_CATEGORY_MANAGEMENT');
    });
  });

  describe('DOM要素表示', () => {
    test('activeTabId が assistant の時、アシスタントタブが表示されること', () => {
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('[data-testid="assistant-tab"]'))).toBeTruthy();
      expect(fixture.debugElement.query(By.css('[data-testid="category-tab"]'))).toBeNull();
    });

    test('activeTabId が assistant-category の時、カテゴリタブが表示されること', async () => {
      const router = TestBed.inject(Router);
      await router.navigateByUrl('/?tab=assistant-category');
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('[data-testid="assistant-tab"]'))).toBeNull();
      expect(fixture.debugElement.query(By.css('[data-testid="category-tab"]'))).toBeTruthy();
    });
  });

  describe('DOM要素イベント', () => {
    test('タブが変更された時、activeTabId が更新されること', async () => {
      const header = fixture.debugElement.query(By.directive(PageHeaderStub)).componentInstance;
      header.tabChange.emit({ id: 'assistant-category', label: 'label' });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.activeTabId()).toBe('assistant-category');
    });
  });
});
