import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { TabItem } from 'src/types/tab.type';
import { createTabQueryParam } from '@core/utils/tab-query-param.util';
import { ContentTabComponent } from './components/content-tab/content-tab.component';
import { TagsTabComponent } from './components/tags-tab/tags-tab.component';
import { PageHeaderComponent } from '@app/shared/components';
import { AuthStore } from '@core/stores/auth.store';

@Component({
  selector: 'app-admin-library',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ContentTabComponent,
    TagsTabComponent,
    PageHeaderComponent,
  ],
  templateUrl: './library-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class AdminLibraryComponent {
  private readonly translateService = inject(TranslateService);
  private readonly authStore = inject(AuthStore);

  private readonly tabState = createTabQueryParam({
    validTabs: ['contents', 'tags'] as const,
    defaultTab: 'contents',
  });

  readonly activeTabId = computed(() => {
    const tab = this.tabState.activeTabId();
    if (tab === 'tags' && !this.authStore.isAdmin()) {
      return 'contents';
    }
    return tab;
  });

  readonly onTabChange = this.tabState.onTabChange;

  /** 一般ユーザが URL 直指定で tags タブに入った場合、contents へ正規化する */
  private readonly enforceContentsTabForNonAdmin = effect(() => {
    if (!this.authStore.isAdmin() && this.tabState.activeTabId() === 'tags') {
      this.tabState.onTabChange({ id: 'contents', label: '' });
    }
  });

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
      { id: 'contents', label: this.translateService.instant('ADMIN.LIBRARY.TAB_CONTENTS') },
      { id: 'tags', label: this.translateService.instant('ADMIN.LIBRARY.TAB_TAGS') },
    ];
  });
}
