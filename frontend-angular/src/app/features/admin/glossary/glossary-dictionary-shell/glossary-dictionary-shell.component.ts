import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, NavigationEnd, Router, RouterModule, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { APP_PATHS, ROUTES } from '@core/constants/routes.config';
import { UiStore } from '@core/stores/ui.store';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import type { TabItem } from '@app-types/tab.type';
import { TabComponent } from '@shared/components/tab/tab.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { GlossaryTermsApiService } from '../services/glossary-terms-api.service';
import { GlossaryTermsMockService } from '../services/glossary-terms-mock.service';

@Component({
  selector: 'app-glossary-dictionary-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    RouterOutlet,
    TranslateModule,
    IconButtonComponent,
    SvgIconComponent,
    ContextMenuComponent,
    TabComponent,
    FormInputComponent,
    FormTextareaComponent,
    ComboboxMultiComponent,
    ButtonComponent,
  ],
  templateUrl: './glossary-dictionary-shell.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full w-full min-h-0' },
})
export class GlossaryDictionaryShellComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly uiStore = inject(UiStore);
  private readonly termsApi = inject(GlossaryTermsApiService);
  private readonly translate = inject(TranslateService);
  readonly glossaryMock = inject(GlossaryTermsMockService);

  @ViewChild('editDictForm') editDictForm!: TemplateRef<unknown>;
  @ViewChild('editDictActions') editDictActions!: TemplateRef<unknown>;

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

  readonly editDictName = signal('');
  readonly editDictDesc = signal('');
  readonly editDictAssistants = signal<string[]>([]);
  readonly editDictSubmitted = signal(false);

  readonly editDictNameError = computed(() =>
    this.editDictSubmitted() && this.editDictName().length > 32
      ? '32文字以内で入力してください'
      : '',
  );

  readonly editDictDescError = computed(() => {
    if (!this.editDictSubmitted()) return '';
    const v = this.editDictDesc();
    if (!v.trim()) return this.translate.instant('COMMON.REQUIRED') || '入力してください';
    return v.length > 1000 ? '1000文字以内で入力してください' : '';
  });

  readonly canSaveDictionary = computed(() => {
    const name = this.editDictName().trim();
    const def = this.editDictDesc().trim();
    if (!name) return false;
    if (name.length > 32) return false;
    // if (!def) return false;
    if (def.length > 1000) return false;
    return true;
  });

  toggleSidebar(): void {
    this.uiStore.toggleMobileSidebar();
  }

  openEditDictionary(): void {
    const item = this.dictionaryTerm();
    this.editDictName.set(item?.name ?? '');
    this.editDictDesc.set(item?.definition ?? '');
    this.editDictAssistants.set([]);
    this.editDictSubmitted.set(false);
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.EDIT_DICT_TITLE'),
        content: this.editDictForm,
        customActions: this.editDictActions,
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '100%',
      autoFocus: false,
    });
  }

  async saveEditDictionary(): Promise<void> {
    const id = this.glossaryId();
    if (!id) return;
    if (!this.canSaveDictionary()) {
      this.editDictSubmitted.set(true);
      return;
    }
    const updated = await this.termsApi.update(id, {
      name: this.editDictName().trim(),
      definition: this.editDictDesc().trim(),
      assistant: this.formatAssistantLabels(this.editDictAssistants()),
    });
    this.dictionaryTerm.set({
      ...updated,
      editedDate: new Date(updated.editedDate),
    });
    this.dialog.closeAll();
  }

  closeDialogs(): void {
    this.dialog.closeAll();
  }

  openDeleteDictionary(): void {
    const id = this.glossaryId();
    if (!id) return;
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.DELETE_DICT_TITLE'),
        message: this.translate.instant('ADMIN.GLOSSARY.DELETE_DICT_MESSAGE'),
        showConfirm: true,
        confirmText: this.translate.instant('COMMON.DELETE'),
        confirmDanger: true,
        confirmIcon: 'delete',
        cancelText: this.translate.instant('COMMON.CANCEL'),
        showCancel: true,
        confirmVariant: 'danger',
        contentClass: 'md:pt-6 pt-2 overflow-y-auto',
        confirmAction: () => {
          void this.performDeleteDictionary(id);
        },
      } as DialogData,
      width: '100%',
    });
  }

  private async performDeleteDictionary(id: string): Promise<void> {
    try {
      await this.termsApi.delete(id);
    } finally {
      this.dialog.closeAll();
      await this.router.navigateByUrl(ROUTES.APP.GLOSSARY);
    }
  }

  private formatAssistantLabels(values: string[]): string {
    const opts = this.glossaryMock.assistantOptions();
    return values
      .map((v) => opts.find((o) => o.value === v)?.label ?? v)
      .filter(Boolean)
      .join(', ');
  }
}
