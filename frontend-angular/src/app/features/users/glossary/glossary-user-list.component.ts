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
import { Router } from '@angular/router';
import { map, startWith } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { GlossaryItem } from '@app-types/admin/glossary.types';
import { ButtonComponent } from '@shared/components/button/button.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { ROUTES } from '@core/constants/routes.config';
import { UserGlossaryTermsApiService } from './services/user-glossary-terms-api.service';

@Component({
  selector: 'app-glossary-user-list',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PageHeaderComponent,
    SearchInputComponent,
    FormSortInputComponent,
    PaginationComponent,
    ButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './glossary-user-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class GlossaryUserListComponent {
  private readonly router = inject(Router);
  private readonly glossaryTermsApi = inject(UserGlossaryTermsApiService);
  private readonly translate = inject(TranslateService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  readonly isLoading = signal(true);
  private readonly items = signal<GlossaryItem[]>([]);

  readonly searchInput = signal('');
  readonly sortField = signal<string | null>('updatedAt');
  readonly sortOrder = signal<string>('desc');
  readonly currentPage = signal(1);
  readonly pageSize = signal(5);

  readonly sortFields = computed<SortOption[]>(() => {
    this.langChange();
    return [
      {
        value: 'updatedAt',
        label: this.translate.instant('USER_GLOSSARY.SORT_UPDATED'),
      },
      {
        value: 'term',
        label: this.translate.instant('USER_GLOSSARY.SORT_NAME'),
      },
    ];
  });

  constructor() {
    effect((onCleanup) => {
      const q = this.searchInput().trim();
      const sortField = this.sortField();
      const sortOrder = this.sortOrder();

      // Reset pagination when filters/sort change.
      this.currentPage.set(1);

      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });

      void this.refresh({
        q: q || undefined,
        sortField: sortField || undefined,
        sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
      }).finally(() => {
        if (cancelled) return;
      });
    });
  }

  private async refresh(params?: {
    q?: string;
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
    let rows = this.items();

    const q = this.searchInput().trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.definition.toLowerCase().includes(q) ||
          (item.assistant?.toLowerCase().includes(q) ?? false),
      );
    }

    const field = this.sortField();
    const order = this.sortOrder() === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      if (field === 'term') {
        return a.name.localeCompare(b.name) * order;
      }
      return (a.editedDate.getTime() - b.editedDate.getTime()) * order;
    });

    return rows;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize())),
  );

  readonly countDisplay = computed(() => {
    this.langChange();
    const total = this.filteredItems().length;
    if (total === 0) return '';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return this.translate.instant('ADMIN.GLOSSARY.WORD_PAGE_COUNT', { start, end, total });
  });

  readonly paginatedItems = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredItems().slice(start, start + this.pageSize());
  });

  onView(item: GlossaryItem): void {
    void this.router.navigateByUrl(ROUTES.APP.GLOSSARY_TERM_WORDS(item.id));
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onSearchQuery(query: string): void {
    this.searchInput.set(query);
    this.currentPage.set(1);
  }
}
