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
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { GlossaryItem } from '@app-types/admin/glossary.types';
import { ButtonComponent } from '@app/shared/components';
import { DialogComponent, DialogData } from '@app/shared/components/dialog/dialog.component';
import { FormInputComponent } from '@app/shared/components/form/form-input/form-input.component';
import { FormSortInputComponent } from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { FormTextareaComponent } from '@app/shared/components/form/form-textarea/form-textarea.component';
import { TranslateModule } from '@ngx-translate/core';
import { TranslateService } from '@ngx-translate/core';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SearchInputComponent } from '@app/shared/components/input/search-input.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { ROUTES } from '@core/constants/routes.config';
import { GlossaryTermsMockService } from '../../services/glossary-terms-mock.service';
import { GlossaryTermsApiService } from '../../services/glossary-terms-api.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';

@Component({
  selector: 'app-glossary-terms-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    MatIconModule,
    FormSortInputComponent,
    ButtonComponent,
    FormInputComponent,
    FormTextareaComponent,
    SearchInputComponent,
    AppMatIconComponent,
    SvgIconComponent,
    ComboboxMultiComponent,
  ],
  templateUrl: './terms-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class GlossaryTermsTabComponent {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly glossaryTermsMock = inject(GlossaryTermsMockService);
  private readonly glossaryTermsApi = inject(GlossaryTermsApiService);
  private readonly translate = inject(TranslateService);

  private t(key: string, params?: Record<string, unknown>, fallback = ''): string {
    const translated = this.translate.instant(key, params);
    return translated === key ? fallback : translated;
  }

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  @ViewChild('addTermForm') addTermFormTemplate!: TemplateRef<unknown>;
  @ViewChild('addTermActions') addTermActionsTemplate!: TemplateRef<unknown>;

  readonly assistantOptions = this.glossaryTermsMock.assistantOptions;

  readonly isLoading = signal(true);
  private readonly items = signal<GlossaryItem[]>([]);

  // Form signals for Add Term
  readonly newTermName = signal<string>('');
  readonly newTermDescription = signal<string>('');
  readonly newTermAssistant = signal<string[]>([]);
  readonly addTermSubmitted = signal(false);

  readonly newTermNameError = computed(() => {
    if (!this.addTermSubmitted()) return '';
    const v = this.newTermName();
    return v.length > 32 ? '32文字以内で入力してください' : '';
  });

  readonly newTermDescriptionError = computed(() => {
    if (!this.addTermSubmitted()) return '';
    const v = this.newTermDescription();
    if (!v.trim()) return this.t('COMMON.REQUIRED', undefined, '入力してください');
    return v.length > 1000 ? '1000文字以内で入力してください' : '';
  });

  readonly canSubmitNewTerm = computed(() => {
    const name = this.newTermName().trim();
    if (!name) return false;
    if (name.length > 32) return false;
    const desc = this.newTermDescription().trim();
    // if (!desc) return false;
    if (desc.length > 1000) return false;
    return true;
  });

  // Filter & sort signals
  readonly filterCategory = signal<string>('');
  readonly searchInput = signal<string>('');
  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<string>('desc');

  // Pagination signals
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(3);

  constructor() {
    effect((onCleanup) => {
      const q = this.searchInput().trim();
      const category = this.filterCategory().trim();
      const sortField = this.sortField();
      const sortOrder = this.sortOrder();

      this.currentPage.set(1);

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      void this.refresh({
        q: q || undefined,
        category: category || undefined,
        sortField: sortField || undefined,
        sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
      }).finally(() => {
        if (cancelled) return;
      });
    });
  }

  private async refresh(params?: {
    q?: string;
    category?: string;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<void> {
    this.isLoading.set(true);
    const res = await this.glossaryTermsApi.list({ page: 1, pageSize: 1000, ...params });
    this.items.set(
      res.data.map((item) => ({
        ...(item as unknown as GlossaryItem),
        editedDate: new Date(item.editedDate),
      })),
    );
    this.isLoading.set(false);
  }

  readonly filteredItems = computed(() => {
    let items = this.items();

    if (this.filterCategory()) {
      items = items.filter((item) => item.category === this.filterCategory());
    }

    if (this.searchInput()) {
      const search = this.searchInput().toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(search) ||
          item.definition.toLowerCase().includes(search) ||
          item.creator.toLowerCase().includes(search) ||
          item.tags.some((tag) => tag.toLowerCase().includes(search)),
      );
    }

    const field = this.sortField();
    if (field) {
      const order = this.sortOrder() === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => {
        if (field === 'updatedAt') {
          return (a.editedDate.getTime() - b.editedDate.getTime()) * order;
        } else if (field === 'term') {
          return a.name.localeCompare(b.name) * order;
        }
        return 0;
      });
    }

    return items;
  });

  readonly totalPages = computed(() => Math.ceil(this.filteredItems().length / this.pageSize()));

  readonly countDisplay = computed(() => {
    this.langChange();
    const total = this.filteredItems().length;
    if (total === 0) return '';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return this.t(
      'ADMIN.GLOSSARY.WORD_PAGE_COUNT',
      { start, end, total },
      `${start}-${end} / ${total}`,
    );
  });

  readonly paginatedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredItems().slice(start, end);
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: number[] = [1];
    if (current > 3) pages.push(-1);
    for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++)
      pages.push(p);
    if (current < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  });

  onAddTerm(): void {
    this.newTermName.set('');
    this.newTermDescription.set('');
    this.newTermAssistant.set([]);
    this.addTermSubmitted.set(false);

    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.ADD_TERM'),
        content: this.addTermFormTemplate,
        customActions: this.addTermActionsTemplate,
        showDefaultActions: false,
        buttonAlign: 'right',
        contentClass: 'pb-0!',
      } as DialogData,
      width: '100%',
      autoFocus: false,
    });
  }

  confirmAddTerm(): void {
    const name = this.newTermName().trim();
    const definition = this.newTermDescription().trim();
    if (!this.canSubmitNewTerm()) {
      this.addTermSubmitted.set(true);
      return;
    }

    void this.glossaryTermsApi
      .create({
        name,
        definition,
        assistant: this.formatAssistantLabels(this.newTermAssistant()),
      })
      .then(() => this.refresh())
      .finally(() => this.dialog.closeAll());
  }

  /** Navigate to dictionary detail (terms + assistants tabs), matching Astro term-word pages. */
  onViewDictionary(item: GlossaryItem): void {
    void this.router.navigateByUrl(ROUTES.APP.GLOSSARY_TERM_WORDS(item.id));
  }

  private formatAssistantLabels(values: string[]): string {
    const opts = this.glossaryTermsMock.assistantOptions();
    return values
      .map((v) => opts.find((o) => o.value === v)?.label ?? v)
      .filter(Boolean)
      .join(', ');
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onSearchQuery(query: string): void {
    this.searchInput.set(query);
    this.currentPage.set(1);
  }

  closeDialog(): void {
    this.dialog.closeAll();
  }

  onDeleteTerm(item: GlossaryItem): void {
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('COMMON.DELETE'),
        message: this.translate.instant('ADMIN.LIBRARY.TAGS.DELETE.MESSAGE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        confirmAction: () => {
          void this.glossaryTermsApi
            .delete(item.id)
            .then(() => this.refresh())
            .finally(() => this.dialog.closeAll());
        },
        cancelAction: () => this.dialog.closeAll(),
        buttonAlign: 'center',
        contentClass: 'md:pt-6 pt-2',
      } as DialogData,
      width: '100%',
    });
  }
}
