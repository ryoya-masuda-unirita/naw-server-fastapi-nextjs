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
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import type { GlossaryTagItem } from '@app-types/admin/glossary.types';
import { SelectOption } from '@app-types/common';
import { ButtonComponent } from '@app/shared/components';
import { FormSortInputComponent } from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { GlossaryTagsApiService } from '../../services/glossary-tags-api.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SkeletonComponent } from '@shared/components/skeleton/skeleton.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { TagEditSettingsDialogComponent } from './tag-edit-settings-dialog.component';
import { TagItemMenuComponent } from './tag-item-menu.component';

@Component({
  selector: 'app-glossary-tags-tab',
  standalone: true,
  imports: [
    CommonModule,
    PaginationComponent,
    ButtonComponent,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    FormSortInputComponent,
    TagItemMenuComponent,
    AppMatIconComponent,
    SvgIconComponent,
    SkeletonComponent,
  ],
  templateUrl: './tags-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class TagsTabComponent implements OnInit {
  @ViewChild('editTagCustomActions', { static: true })
  private editTagCustomActions!: TemplateRef<unknown>;
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly tagsApi = inject(GlossaryTagsApiService);

  private readonly langChange = toSignal(
    this.translate.onLangChange.pipe(
      startWith(null),
      map(() => this.translate.currentLang),
    ),
  );

  readonly sortOptions: SelectOption[] = [
    { value: 'updatedAt', label: this.translate.instant('ADMIN.LIBRARY.TAGS.SORT_UPDATED_AT') },
    { value: 'name', label: this.translate.instant('ADMIN.LIBRARY.TAGS.SORT_NAME') },
  ];

  readonly sortBy = signal<string>('');
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(5);
  readonly selectedTags = signal<GlossaryTagItem[]>([]);

  readonly isCreateMode = signal(false);
  private readonly formValid = signal(false);
  isFormValid(): boolean {
    return this.formValid();
  }
  private readonly onValidChange = (valid: boolean) => this.formValid.set(valid);

  readonly isLoading = signal(true);
  private readonly tags = signal<GlossaryTagItem[]>([]);
  private readonly editingTag = signal<GlossaryTagItem | null>(null);

  readonly editName = signal('');
  readonly editDescription = signal('');

  ngOnInit(): void {
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    this.isLoading.set(true);
    const res = await this.tagsApi.list();
    this.tags.set(
      res.data.map((item) => ({
        ...item,
        updatedDate: new Date(item.updatedDate),
      })),
    );
    this.isLoading.set(false);
  }

  readonly sortedTags = computed(() => {
    const items = [...this.tags()];
    if (this.sortBy() === 'name') return items.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return items.sort((a, b) => b.updatedDate.getTime() - a.updatedDate.getTime());
  });

  readonly totalPages = computed(() => Math.ceil(this.sortedTags().length / this.pageSize()));
  readonly paginatedTags = computed(() =>
    this.sortedTags().slice(
      (this.currentPage() - 1) * this.pageSize(),
      this.currentPage() * this.pageSize(),
    ),
  );
  readonly allSelected = computed(
    () =>
      this.paginatedTags().length > 0 &&
      this.paginatedTags().every((tag) => this.selectedTags().some((s) => s.id === tag.id)),
  );
  readonly someSelected = computed(
    () =>
      this.paginatedTags().some((tag) => this.selectedTags().some((s) => s.id === tag.id)) &&
      !this.allSelected(),
  );
  readonly countDisplay = computed(() => {
    this.langChange();
    const total = this.sortedTags().length;
    if (total === 0) return '';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), total);
    return this.translate.instant('ADMIN.GLOSSARY.WORD_PAGE_COUNT', { start, end, total });
  });

  isTagSelected(item: GlossaryTagItem): boolean {
    return this.selectedTags().some((t) => t.id === item.id);
  }

  toggleItemSelection(item: GlossaryTagItem, checked: boolean): void {
    if (checked) {
      this.selectedTags.update((tags) => [...tags, item]);
    } else {
      this.selectedTags.update((tags) => tags.filter((t) => t.id !== item.id));
    }
  }

  toggleAllSelection(checked: boolean): void {
    if (checked) {
      this.selectedTags.set([...this.paginatedTags()]);
    } else {
      this.selectedTags.set([]);
    }
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
  }

  onCreateTag(): void {
    this.isCreateMode.set(true);
    this.formValid.set(false);
    this.editingTag.set(null);
    this.editName.set('');
    this.editDescription.set('');
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.GLOSSARY.ADD_TAG'),
        contentComponent: TagEditSettingsDialogComponent,
        contentComponentInputs: {
          onValidChange: this.onValidChange,
          nameSignal: this.editName,
          descriptionSignal: this.editDescription,
        },
        customActions: this.editTagCustomActions,
        showDefaultActions: false,
        buttonAlign: 'right',
        contentClass: 'md:pt-5 pt:4 gap-4 md:gap-6',
      } as DialogData,
      width: '100%',
    });
  }

  onEditSettings(tag: GlossaryTagItem): void {
    this.isCreateMode.set(false);
    this.formValid.set(false);
    this.editingTag.set(tag);
    this.editName.set(tag.name ?? '');
    this.editDescription.set(tag.description ?? '');
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TITLE'),
        contentComponent: TagEditSettingsDialogComponent,
        contentComponentInputs: {
          item: tag,
          onValidChange: this.onValidChange,
          nameSignal: this.editName,
          descriptionSignal: this.editDescription,
        },
        customActions: this.editTagCustomActions,
        showDefaultActions: false,
        buttonAlign: 'right',
        contentClass: 'md:pt-5 pt:4 gap-4 md:gap-6',
      } as DialogData,
      width: '100%',
    });
  }

  closeEditTagDialog(): void {
    this.dialog.closeAll();
  }

  saveEditTag(): void {
    const name = this.editName().trim();
    const description = this.editDescription().trim();
    if (!name) return;

    const editing = this.editingTag();
    if (this.isCreateMode() || !editing) {
      void this.tagsApi
        .create({ name, description: description || undefined })
        .then(() => this.refresh())
        .finally(() => this.dialog.closeAll());
      return;
    }

    void this.tagsApi
      .update(editing.id, { name, description: description || undefined })
      .then(() => this.refresh())
      .finally(() => this.dialog.closeAll());
  }

  onDeselectAll(): void {
    this.selectedTags.set([]);
  }

  onDeleteTag(tag: GlossaryTagItem): void {
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.LIBRARY.TAGS.DELETE.TITLE'),
        message: this.translate.instant('ADMIN.LIBRARY.TAGS.DELETE.MESSAGE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        confirmAction: () => {
          void this.tagsApi
            .delete(tag.id)
            .then(() => {
              this.selectedTags.update((prev) => prev.filter((t) => t.id !== tag.id));
              return this.refresh();
            })
            .finally(() => this.dialog.closeAll());
        },
        cancelAction: () => this.dialog.closeAll(),
        buttonAlign: 'center',
        contentClass: 'md:pt-6 pt-2',
      } as DialogData,
      width: '100%',
    });
  }

  openDeleteSelectedTags(): void {
    const selected = this.selectedTags();
    if (selected.length === 0) return;

    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.LIBRARY.TAGS.DELETE.TITLE'),
        message: this.translate.instant('ADMIN.LIBRARY.TAGS.DELETE.MESSAGE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        confirmAction: () => {
          void Promise.allSettled(selected.map((t) => this.tagsApi.delete(t.id)))
            .then(() => {
              this.selectedTags.set([]);
              return this.refresh();
            })
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
