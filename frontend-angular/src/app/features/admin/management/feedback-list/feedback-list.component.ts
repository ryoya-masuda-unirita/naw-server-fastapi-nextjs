import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { createTabQueryParam } from '@core/utils/tab-query-param.util';
import { AdminPageShellComponent } from '@shared/layouts/admin-page-shell/admin-page-shell.component';
import type { TabItem } from '@app-types/tab.type';
import { AccuracyTabComponent } from './components/accuracy-tab/accuracy-tab.component';
import { CountTabComponent } from './components/count-tab/count-tab.component';
import { SatisfactionTabComponent } from './components/satisfaction-tab/satisfaction-tab.component';

@Component({
  selector: 'app-admin-feedback-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    AdminPageShellComponent,
    AccuracyTabComponent,
    SatisfactionTabComponent,
    CountTabComponent,
  ],
  templateUrl: './feedback-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full' },
})
export class AdminFeedbackListComponent {
  private readonly tabState = createTabQueryParam({
    validTabs: ['accuracy', 'satisfaction', 'count'] as const,
    defaultTab: 'accuracy',
  });

  readonly activeTabId = this.tabState.activeTabId;
  readonly onTabChange = this.tabState.onTabChange;

  readonly tabs = computed<TabItem[]>(() => [
    { id: 'accuracy', label: 'FEEDBACK.TAB_ACCURACY' },
    { id: 'satisfaction', label: 'FEEDBACK.TAB_SATISFACTION' },
    { id: 'count', label: 'FEEDBACK.TAB_COUNT' },
  ]);
}
