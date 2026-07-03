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
import { FormInputComponent } from '@shared/components/form/form-input/form-input.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { FormTextareaComponent } from '@shared/components/form/form-textarea/form-textarea.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import {
  PeriodFilterComponent,
  PeriodChange,
} from '@shared/components/filter/period-filter/period-filter.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { MultiSelectComponent } from '@shared/components/multi-select/multi-select.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { GlossaryDictionaryWordsApiService } from '../services/glossary-dictionary-words-api.service';

@Component({
  selector: 'app-term-word-admin',
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
    FormInputComponent,
    FormTextareaComponent,
    ContextMenuComponent,
    MultiSelectComponent,
  ],
  templateUrl: './term-word-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-8 md:gap-6 min-w-0',
  },
})
export class TermWordAdminComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  private readonly wordsApi = inject(GlossaryDictionaryWordsApiService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  @ViewChild('previewTpl') previewTpl!: TemplateRef<unknown>;
  @ViewChild('previewActions') previewActions!: TemplateRef<unknown>;
  @ViewChild('editWordTpl') editWordTpl!: TemplateRef<unknown>;
  @ViewChild('editWordActions') editWordActions!: TemplateRef<unknown>;

  readonly wordRows = signal<GlossaryWordTableRow[]>([]);

  readonly searchQuery = signal('');
  readonly tagFilter = signal<string | null>(null);
  readonly filterPeriod = signal('');
  readonly filterPeriodRange = signal<{ from: string; to: string } | null>(null);
  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<string | null>(null);
  readonly pageIndex = signal(1);
  readonly pageSize = 5;

  readonly tagOptions: SelectOption[] = [
    { value: 'tag-a', label: 'タグA' },
    { value: 'tag-b', label: 'タグB' },
    { value: 'tag-c', label: 'タグC' },
    { value: 'tag-d', label: 'タグD' },
    { value: 'tag-r', label: 'タグR' },
  ];

  readonly assistantOptions: SelectOption[] = [
    { value: 'assistant-1', label: 'Azure4o-mini' },
    { value: 'assistant-2', label: '論文添削' },
    { value: 'assistant-3', label: '議事録作成' },
  ];

  readonly sortFields: SortOption[] = [
    { value: 'updated', label: 'ADMIN.GLOSSARY.WORD_SORT_UPDATED' },
    { value: 'name', label: 'ADMIN.GLOSSARY.WORD_SORT_NAME' },
    { value: 'author', label: 'ADMIN.GLOSSARY.WORD_SORT_AUTHOR' },
  ];

  readonly previewRow = signal<GlossaryWordTableRow | null>(null);
  readonly editWordName = signal('');
  readonly editWordDef = signal('');
  readonly editWordTags = signal<string[]>([]);
  readonly editingWordId = signal<string | null>(null);
  readonly editWordSubmitted = signal(false);

  readonly editWordNameError = computed(() =>
    this.editWordSubmitted() && this.editWordName().length > 32
      ? '32文字以内で入力してください'
      : '',
  );

  readonly editWordDefError = computed(() => {
    if (!this.editWordSubmitted()) return '';
    const v = this.editWordDef();
    if (!v.trim()) return this.translate.instant('COMMON.REQUIRED') || '入力してください';
    return v.length > 1000 ? '1000文字以内で入力してください' : '';
  });

  readonly canSaveEditWord = computed(() => {
    const name = this.editWordName().trim();
    const def = this.editWordDef().trim();
    if (!name) return false;
    if (name.length > 32) return false;
    if (!def) return false;
    if (def.length > 1000) return false;
    return true;
  });

  readonly selectedWordIds = signal<Set<string>>(new Set());

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

  readonly headerChecked = computed(() => {
    const ids = this.filteredRows().map((r) => r.id);
    const sel = this.selectedWordIds();
    return ids.length > 0 && ids.every((id) => sel.has(id));
  });

  readonly headerIndeterminate = computed(() => {
    const ids = this.filteredRows().map((r) => r.id);
    const sel = this.selectedWordIds();
    const n = ids.filter((id) => sel.has(id)).length;
    return n > 0 && n < ids.length;
  });

  readonly hasSelection = computed(() => this.selectedWordIds().size > 0);

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

  onToggleSelectAll(checked: boolean): void {
    const ids = this.filteredRows().map((r) => r.id);
    this.selectedWordIds.update((prev) => {
      const next = new Set(prev);
      if (checked) {
        ids.forEach((id) => next.add(id));
      } else {
        ids.forEach((id) => next.delete(id));
      }
      return next;
    });
  }

  onToggleRow(id: string, checked: boolean): void {
    this.selectedWordIds.update((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  isRowSelected(id: string): boolean {
    return this.selectedWordIds().has(id);
  }

  deselectAll(): void {
    this.selectedWordIds.set(new Set());
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
        contentClass: 'md:pt-5 pt-4 overflow-y-auto',
      } as DialogData,
      width: '100%',
    });
  }

  openEditFromPreview(): void {
    const row = this.previewRow();
    this.dialog.closeAll();
    if (row) this.openEditWord(row);
  }

  openEditWord(row: GlossaryWordTableRow): void {
    this.editingWordId.set(row.id);
    this.editWordName.set(row.name);
    this.editWordDef.set(row.description);
    this.editWordTags.set([]);
    this.editWordSubmitted.set(false);
    this.dialog.open(DialogComponent, {
      width: '100%',
      panelClass: 'dialog-overflow-visible',
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.EDIT_WORD_TITLE'),
        content: this.editWordTpl,
        customActions: this.editWordActions,
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
    });
  }

  saveEditWord(): void {
    const id = this.editingWordId();
    const gid = this.getGlossaryId();
    if (!this.canSaveEditWord()) {
      this.editWordSubmitted.set(true);
      return;
    }
    if (id && gid) {
      void this.wordsApi
        .update(gid, id, {
          name: this.editWordName().trim(),
          description: this.editWordDef().trim(),
          tags: this.editWordTags(),
        })
        .then(() => this.refreshWords(gid));
    }
    this.dialog.closeAll();
    this.editingWordId.set(null);
  }

  closeDialogs(): void {
    this.dialog.closeAll();
  }

  private openDeleteWordsConfirmDialog(ids: string[]): void {
    if (ids.length === 0) return;
    const gid = this.getGlossaryId();
    const dialogData: DialogData = {
      title: this.translate.instant('ADMIN.GLOSSARY.DELETE_WORDS_TITLE'),
      message: this.translate.instant('ADMIN.GLOSSARY.DELETE_WORDS_MESSAGE'),
      showConfirm: true,
      confirmText: this.translate.instant('COMMON.DELETE'),
      confirmDanger: true,
      confirmIcon: 'delete',
      showCancel: true,
      cancelText: this.translate.instant('COMMON.CANCEL'),
      buttonAlign: 'center',
      contentClass: 'md:pt-6 pt-2',
      confirmAction: () => {
        if (!gid) {
          this.dialog.closeAll();
          return;
        }
        const req =
          ids.length === 1
            ? this.wordsApi.delete(gid, ids[0]!)
            : this.wordsApi.bulkDelete(gid, ids);
        void req
          .then(() => {
            this.selectedWordIds.set(new Set());
            return this.refreshWords(gid);
          })
          .finally(() => this.dialog.closeAll());
      },
      cancelAction: () => this.dialog.closeAll(),
    };

    this.dialog.open(DialogComponent, {
      data: dialogData,
      width: '100%',
    });
  }

  openDeleteSelected(): void {
    this.openDeleteWordsConfirmDialog([...this.selectedWordIds()]);
  }

  openDeleteWord(row: GlossaryWordTableRow): void {
    this.openDeleteWordsConfirmDialog([row.id]);
  }
}
