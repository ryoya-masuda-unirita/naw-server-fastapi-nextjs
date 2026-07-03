import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { APP_PATHS } from '@core/constants/routes.config';
import { UiStore } from '@core/stores/ui.store';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import type { TabItem } from '@app-types/tab.type';
import { TabComponent } from '@shared/components/tab/tab.component';
import { UserGlossaryTermsApiService } from './services/user-glossary-terms-api.service';

@Component({
  selector: 'app-glossary-user-dictionary-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    TranslateModule,
    IconButtonComponent,
    SvgIconComponent,
    TabComponent,
  ],
  templateUrl: './glossary-user-dictionary-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full min-h-0' },
})
export class GlossaryUserDictionaryShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly uiStore = inject(UiStore);
  private readonly termsApi = inject(UserGlossaryTermsApiService);

  readonly glossaryBasePath = APP_PATHS.GLOSSARY;

  readonly glossaryId = toSignal(this.route.paramMap.pipe(map((p) => p.get('glossaryId') ?? '')), {
    initialValue: '',
  });

  readonly dictionaryTerm = signal<GlossaryItem | null>(null);

  constructor() {
    effect((onCleanup) => {
      const id = this.glossaryId();
      if (!id) {
        this.dictionaryTerm.set(null);
        return;
      }
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      void this.termsApi.getById(id).then(
        (raw) => {
          if (cancelled) return;
          this.dictionaryTerm.set({
            ...raw,
            editedDate: new Date(raw.editedDate),
          });
        },
        () => {
          if (!cancelled) this.dictionaryTerm.set(null);
        },
      );
    });
  }

  readonly dictionaryTabs = computed<TabItem[]>(() => {
    const id = this.glossaryId();
    const disabled = !id;

    return [
      {
        id: 'term-words',
        label: 'ADMIN.GLOSSARY.DICT_TAB_WORDS',
        route: disabled ? '#' : `/glossary/${id}/term-words`,
        disabled,
      },
      {
        id: 'assistants',
        label: 'ADMIN.GLOSSARY.DICT_TAB_ASSISTANTS',
        route: disabled ? '#' : `/glossary/${id}/assistants`,
        disabled,
      },
    ];
  });

  readonly activeTabId = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      startWith(null),
      map(() => (this.router.url.includes('/assistants') ? 'assistants' : 'term-words')),
    ),
    { initialValue: 'term-words' },
  );

  readonly dictionaryTitle = computed(() => this.dictionaryTerm()?.name ?? '');

  toggleSidebar(): void {
    this.uiStore.toggleMobileSidebar();
  }
}
