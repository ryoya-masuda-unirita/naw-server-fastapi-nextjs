import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { SelectOption } from '@app-types/common';
import type { GlossaryWordTableRow } from '@app-types/admin/glossary-dictionary.types';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import {
  PeriodFilterComponent,
  PeriodChange,
} from '@shared/components/filter/period-filter/period-filter.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { UserGlossaryDictionaryWordsApiService } from './services/user-glossary-dictionary-words-api.service';

@Component({
  selector: 'app-glossary-user-term-words',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SearchInputComponent,
    PeriodFilterComponent,
    SelectComponent,
    FormSortInputComponent,
    PaginationComponent,
    ButtonComponent,
    IconButtonComponent,
    SvgIconComponent,
    TableListComponent,
    TableListItemComponent,
  ],
  templateUrl: './glossary-user-term-words.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-8 md:gap-6 min-w-0',
  },
})
export class GlossaryUserTermWordsComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly wordsApi = inject(UserGlossaryDictionaryWordsApiService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  @ViewChild('previewTpl') previewTpl!: TemplateRef<unknown>;
  @ViewChild('previewActions') previewActions!: TemplateRef<unknown>;

  readonly wordRows = signal<GlossaryWordTableRow[]>([]);

  readonly searchQuery = signal('');
  readonly tagFilter = signal<string | null>(null);
  readonly filterPeriod = signal('');
  readonly filterPeriodRange = signal<{ from: string; to: string } | null>(null);
  readonly sortField = signal<string | null>('updated');
  readonly sortOrder = signal<string>('desc');
  readonly pageIndex = signal(1);
  readonly pageSize = 5;

  readonly tagOptions: SelectOption[] = [
    { value: 'tag-a', label: 'タグA' },
    { value: 'tag-b', label: 'タグB' },
    { value: 'tag-c', label: 'タグC' },
    { value: 'tag-d', label: 'タグD' },
    { value: 'tag-r', label: 'タグR' },
  ];

  readonly sortFields: SortOption[] = [
    { value: 'updated', label: 'ADMIN.GLOSSARY.WORD_SORT_UPDATED' },
    { value: 'name', label: 'ADMIN.GLOSSARY.WORD_SORT_NAME' },
    { value: 'author', label: 'ADMIN.GLOSSARY.WORD_SORT_AUTHOR' },
  ];

  readonly previewRow = signal<GlossaryWordTableRow | null>(null);

  ngOnInit(): void {
    const id = this.getGlossaryId();
    if (id) void this.refreshWords(id);
    this.route.parent?.paramMap.subscribe((p) => {
      const next = p.get('glossaryId') ?? '';
      if (next) void this.refreshWords(next);
    });
  }

  private getGlossaryId(): string {
    return this.route.parent?.snapshot.paramMap.get('glossaryId') ?? '';
  }

  private async refreshWords(glossaryId: string): Promise<void> {
    const res = await this.wordsApi.list(glossaryId);
    this.wordRows.set(res.data);
  }

  readonly filteredRows = computed(() => {
    let rows = [...this.wordRows()];
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    const tf = this.tagFilter();
    if (tf) {
      const label = this.tagOptions.find((o) => o.value === tf)?.label ?? '';
      if (label) {
        rows = rows.filter((r) => r.tags.some((t) => t.includes(label.charAt(0))));
      }
    }

    const field = this.sortField();
    const order = this.sortOrder() === 'asc' ? 1 : -1;
    if (field === 'name') {
      rows.sort((a, b) => a.name.localeCompare(b.name) * order);
    } else if (field === 'author') {
      rows.sort((a, b) => a.author.localeCompare(b.author) * order);
    } else {
      rows.sort((a, b) => a.dateLabel.localeCompare(b.dateLabel) * order);
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
    return this.translate.instant('ADMIN.GLOSSARY.WORD_PAGE_COUNT', {
      start,
      end,
      total,
    });
  });

  onSearch(value: string): void {
    this.searchQuery.set(value);
    this.pageIndex.set(1);
  }

  onTagChange(value: string | null): void {
    this.tagFilter.set(value);
    this.pageIndex.set(1);
  }

  onPeriodChange(event: PeriodChange): void {
    this.filterPeriod.set(event.value);
    this.filterPeriodRange.set(event.range);
    this.pageIndex.set(1);
  }

  onPageChange(p: number): void {
    this.pageIndex.set(p);
  }

  openPreview(row: GlossaryWordTableRow): void {
    this.previewRow.set(row);
    this.dialog.open(DialogComponent, {
      data: {
        title: row.name,
        content: this.previewTpl,
        customActions: this.previewActions,
        showDefaultActions: false,
        buttonAlign: 'center',
        contentClass: 'pt-5 overflow-y-auto',
      } as DialogData,
      width: '100%',
    });
  }

  closeDialogs(): void {
    this.dialog.closeAll();
  }
}
