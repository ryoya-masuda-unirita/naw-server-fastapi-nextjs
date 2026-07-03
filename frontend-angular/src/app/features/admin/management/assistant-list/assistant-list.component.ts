import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { TabItem } from '@app-types/tab.type';
import { createTabQueryParam } from '@core/utils/tab-query-param.util';
import { AssistantTabComponent } from './components/assistant-tab/assistant-tab.component';
import { CategoryTabComponent } from './components/category-tab/category-tab.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AuthStore } from '@core/stores/auth.store';

@Component({
  selector: 'app-admin-assistant-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    AssistantTabComponent,
    CategoryTabComponent,
    PageHeaderComponent,
  ],
  templateUrl: './assistant-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class AdminAssistantListComponent {
  private readonly translateService = inject(TranslateService);
  private readonly authStore = inject(AuthStore);

  private readonly tabState = createTabQueryParam({
    validTabs: ['assistant', 'assistant-category'] as const,
    defaultTab: 'assistant',
  });

  readonly activeTabId = this.tabState.activeTabId;
  readonly onTabChange = this.tabState.onTabChange;

  private readonly langChange = toSignal(
    this.translateService.onLangChange.pipe(
      startWith(null),
      map(() => this.translateService.getCurrentLang()),
    ),
  );

  readonly tabs = computed<TabItem[]>(() => {
    if (!this.authStore.isAdmin()) return [];
    this.langChange();
    return [
      {
        id: 'assistant',
        label: this.translateService.instant('ADMIN.ASSISTANT.TAB_ASSISTANT_LIST'),
      },
      {
        id: 'assistant-category',
        label: this.translateService.instant('ADMIN.ASSISTANT.TAB_CATEGORY_MANAGEMENT'),
      },
    ];
  });
}
