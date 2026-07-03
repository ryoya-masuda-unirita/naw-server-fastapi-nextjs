import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { TabItem } from 'src/types/tab.type';
import { createTabQueryParam } from '@core/utils/tab-query-param.util';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { GlossaryTermsTabComponent } from './components/terms-tab/terms-tab.component';
import { TagsTabComponent as GlossaryTagsTabComponent } from './components/tags-tab/tags-tab.component';

@Component({
  selector: 'app-admin-glossary',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PageHeaderComponent,
    GlossaryTermsTabComponent,
    GlossaryTagsTabComponent,
  ],
  templateUrl: './glossary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block',
  },
})
export class AdminGlossaryComponent {
  private readonly translateService = inject(TranslateService);

  private readonly tabState = createTabQueryParam({
    validTabs: ['terms', 'tags'] as const,
    defaultTab: 'terms',
  });

  readonly activeTabId = this.tabState.activeTabId;
  readonly onTabChange = this.tabState.onTabChange;

  private readonly langChange = toSignal(
    this.translateService.onLangChange.pipe(
      startWith(null),
      map(() => this.translateService.currentLang),
    ),
  );

  readonly tabs = computed<TabItem[]>(() => {
    this.langChange();
    return [
      {
        id: 'terms',
        label: this.translateService.instant('ADMIN.GLOSSARY.TAB_TERMS') || '用語辞書一覧',
      },
      {
        id: 'tags',
        label: this.translateService.instant('ADMIN.GLOSSARY.TAB_TAGS') || 'タグ管理',
      },
    ];
  });
}
