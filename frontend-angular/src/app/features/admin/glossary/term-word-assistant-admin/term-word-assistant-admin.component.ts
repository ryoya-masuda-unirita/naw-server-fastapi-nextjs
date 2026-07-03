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
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import type { SelectOption } from '@app-types/common';
import type { GlossaryDictionaryAssistantRow } from '@app-types/admin/glossary-dictionary.types';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { ComboboxMultiComponent } from '@shared/components/combobox-multi/combobox-multi.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { GlossaryTermsMockService } from '../services/glossary-terms-mock.service';
import { GlossaryDictionaryAssistantsApiService } from '../services/glossary-dictionary-assistants-api.service';

@Component({
  selector: 'app-term-word-assistant-admin',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    SelectComponent,
    FormSortInputComponent,
    ComboboxMultiComponent,
    ButtonComponent,
    IconButtonComponent,
    SvgIconComponent,
    PaginationComponent,
    TableListComponent,
    TableListItemComponent,
  ],
  templateUrl: './term-word-assistant-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-8 md:gap-6 min-w-0',
  },
})
export class TermWordAssistantAdminComponent implements OnInit {
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly route = inject(ActivatedRoute);
  readonly glossaryMock = inject(GlossaryTermsMockService);
  private readonly assistantsApi = inject(GlossaryDictionaryAssistantsApiService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  @ViewChild('addAssistantTpl') addAssistantTpl!: TemplateRef<unknown>;
  @ViewChild('addAssistantActions') addAssistantActions!: TemplateRef<unknown>;

  readonly assistantRows = signal<GlossaryDictionaryAssistantRow[]>([]);

  readonly addAssistantPick = signal<string[]>([]);

  readonly serverFilter = signal<string | null>(null);
  readonly categoryFilter = signal<string | null>(null);
  readonly sortField = signal<string | null>(null);
  readonly sortOrder = signal<string | null>(null);
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

  readonly selectedAssistantIds = signal<Set<string>>(new Set());

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

  readonly headerChecked = computed(() => {
    const ids = this.filteredRows().map((r) => r.id);
    const sel = this.selectedAssistantIds();
    return ids.length > 0 && ids.every((id) => sel.has(id));
  });

  readonly headerIndeterminate = computed(() => {
    const ids = this.filteredRows().map((r) => r.id);
    const sel = this.selectedAssistantIds();
    const n = ids.filter((id) => sel.has(id)).length;
    return n > 0 && n < ids.length;
  });

  readonly hasSelection = computed(() => this.selectedAssistantIds().size > 0);

  readonly showCreateBar = computed(() => !this.hasSelection());

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

  onToggleSelectAll(checked: boolean): void {
    const ids = this.filteredRows().map((r) => r.id);
    this.selectedAssistantIds.update((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  onToggleRow(id: string, checked: boolean): void {
    this.selectedAssistantIds.update((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  isRowSelected(id: string): boolean {
    return this.selectedAssistantIds().has(id);
  }

  deselectAll(): void {
    this.selectedAssistantIds.set(new Set());
  }

  openAddAssistant(): void {
    this.addAssistantPick.set([]);
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.ADD_ASSISTANT_TITLE'),
        content: this.addAssistantTpl,
        customActions: this.addAssistantActions,
        showDefaultActions: false,
        buttonAlign: 'right',
        contentClass: 'pt-4 md:pt-5',
      } as DialogData,
      width: '100%',
    });
  }

  closeDialogs(): void {
    this.dialog.closeAll();
  }

  confirmAddAssistant(): void {
    const gid = this.getGlossaryId();
    const picks = this.addAssistantPick();
    if (gid && picks.length > 0) {
      void this.assistantsApi.add(gid, picks).then(() => this.refreshAssistants(gid));
    }
    this.dialog.closeAll();
  }

  private getDictionaryTitle(): string {
    const glossaryId = this.route.parent?.snapshot.paramMap.get('glossaryId') ?? '';
    const item = glossaryId ? this.glossaryMock.getItemById(glossaryId) : undefined;
    return item?.name ?? '';
  }

  private openDeleteAssistantsConfirmDialog(ids: string[]): void {
    if (ids.length === 0) return;
    const name = this.getDictionaryTitle();
    const gid = this.getGlossaryId();

    const dialogData: DialogData = {
      title: `${name}から選択したアシスタントを削除します`,
      message: this.translate.instant('ADMIN.GLOSSARY.DELETE_ASSISTANTS_MESSAGE'),
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
        void this.assistantsApi
          .bulkDelete(gid, ids)
          .then(() => {
            this.selectedAssistantIds.update((prev) => {
              const next = new Set(prev);
              ids.forEach((id) => next.delete(id));
              return next;
            });
            return this.refreshAssistants(gid);
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

  openDeleteModal(): void {
    this.openDeleteAssistantsConfirmDialog([...this.selectedAssistantIds()]);
  }

  deleteRow(rowId: string): void {
    this.openDeleteAssistantsConfirmDialog([rowId]);
  }
}
