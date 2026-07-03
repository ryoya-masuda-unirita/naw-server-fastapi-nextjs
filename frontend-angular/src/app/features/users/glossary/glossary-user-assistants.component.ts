import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { SelectOption } from '@app-types/common';
import type { GlossaryDictionaryAssistantRow } from '@app-types/admin/glossary-dictionary.types';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { UserGlossaryDictionaryAssistantsApiService } from './services/user-glossary-dictionary-assistants-api.service';

@Component({
  selector: 'app-glossary-user-assistants',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SelectComponent,
    FormSortInputComponent,
    PaginationComponent,
    TableListComponent,
    TableListItemComponent,
    SvgIconComponent,
  ],
  templateUrl: './glossary-user-assistants.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-8 md:gap-6 min-w-0',
  },
})
export class GlossaryUserAssistantsComponent implements OnInit {
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly assistantsApi = inject(UserGlossaryDictionaryAssistantsApiService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  readonly assistantRows = signal<GlossaryDictionaryAssistantRow[]>([]);

  readonly serverFilter = signal<string | null>(null);
  readonly categoryFilter = signal<string | null>(null);
  readonly sortField = signal<string | null>('added');
  readonly sortOrder = signal<string>('desc');
  readonly pageIndex = signal(1);
  readonly pageSize = 2;

  readonly serverOptions: SelectOption[] = [
    { value: 'all', label: '全ての接続サーバー' },
    { value: 'server1', label: 'ローカル' },
    { value: 'server2', label: 'クラウド(一般)' },
    { value: 'server3', label: 'クラウド(学習先指定)' },
  ];

  readonly categoryOptions: SelectOption[] = [
    { value: 'cat-a', label: 'カテゴリA' },
    { value: 'cat-b', label: 'カテゴリB' },
    { value: 'cat-c', label: 'カテゴリC' },
    { value: 'cat-d', label: 'カテゴリD' },
    { value: 'cat-e', label: 'カテゴリE' },
  ];

  readonly sortFields: SortOption[] = [
    { value: 'added', label: 'ADMIN.GLOSSARY.ASSISTANT_SORT_ADDED' },
    { value: 'name', label: 'ADMIN.GLOSSARY.ASSISTANT_SORT_NAME' },
    { value: 'server', label: 'ADMIN.GLOSSARY.ASSISTANT_SORT_SERVER' },
    { value: 'category', label: 'ADMIN.GLOSSARY.ASSISTANT_SORT_CATEGORY' },
  ];

  ngOnInit(): void {
    const id = this.getGlossaryId();
    if (id) void this.refreshAssistants(id);
    this.route.parent?.paramMap.subscribe((p) => {
      const next = p.get('glossaryId') ?? '';
      if (next) void this.refreshAssistants(next);
    });
  }

  private getGlossaryId(): string {
    return this.route.parent?.snapshot.paramMap.get('glossaryId') ?? '';
  }

  private async refreshAssistants(glossaryId: string): Promise<void> {
    const res = await this.assistantsApi.list(glossaryId);
    this.assistantRows.set(res.data);
  }

  readonly filteredRows = computed(() => {
    let rows = [...this.assistantRows()];
    const sf = this.serverFilter();
    if (sf && sf !== 'all') {
      rows = rows.filter((r) => (sf === 'server2' ? r.server.includes('一般') : true));
    }
    const cf = this.categoryFilter();
    if (cf) {
      rows = rows.filter(() => true);
    }

    const field = this.sortField();
    const order = this.sortOrder() === 'asc' ? 1 : -1;
    if (field === 'name') {
      rows.sort((a, b) => a.name.localeCompare(b.name) * order);
    } else if (field === 'server') {
      rows.sort((a, b) => a.server.localeCompare(b.server) * order);
    } else if (field === 'category') {
      rows.sort((a, b) => a.category.localeCompare(b.category) * order);
    }

    return rows;
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)),
  );

  readonly pageSlice = computed(() => {
    const all = this.filteredRows();
    const start = (this.pageIndex() - 1) * this.pageSize;
    return all.slice(start, start + this.pageSize);
  });

  readonly countDisplay = computed(() => {
    this.langChange();
    const total = this.filteredRows().length;
    if (total === 0) return '';
    const start = (this.pageIndex() - 1) * this.pageSize + 1;
    const end = Math.min(this.pageIndex() * this.pageSize, total);
    return this.translate.instant('ADMIN.GLOSSARY.WORD_PAGE_COUNT', { start, end, total });
  });

  onServerChange(value: string | null): void {
    this.serverFilter.set(value);
    this.pageIndex.set(1);
  }

  onCategoryChange(value: string | null): void {
    this.categoryFilter.set(value);
    this.pageIndex.set(1);
  }

  onPageChange(p: number): void {
    this.pageIndex.set(p);
  }
}
