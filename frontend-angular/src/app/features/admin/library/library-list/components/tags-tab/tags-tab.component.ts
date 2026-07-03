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
import { MatIcon } from '@angular/material/icon';
import { TagItem } from '@app-types/admin/library.types';
import { ButtonComponent } from '@app/shared/components';
import { ToastService } from '@core/services/toast.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { TableListComponent } from '@shared/components/table-list/table-list.component';
import { TableListItemComponent } from '@shared/components/table-list/table-list-item.component';
import { TagEditSettingsDialogComponent } from './tag-edit-settings-dialog.component';
import { TagItemMenuComponent } from './tag-item-menu.component';
import { SelectOption } from '@app-types/common';
import { FormSortInputComponent } from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { SkeletonComponent } from '@shared/components/skeleton/skeleton.component';
import { TagsStore } from './tags.store';

@Component({
  selector: 'app-library-tags-tab',
  standalone: true,
  imports: [
    CommonModule,
    PaginationComponent,
    ButtonComponent,
    MatIcon,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    TagItemMenuComponent,
    FormSortInputComponent,
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
  private readonly toast = inject(ToastService);
  readonly store = inject(TagsStore);

  readonly sortOptions: SelectOption[] = [
    { value: 'updatedAt', label: this.translate.instant('ADMIN.LIBRARY.TAGS.SORT_UPDATED_AT') },
    { value: 'name', label: this.translate.instant('ADMIN.LIBRARY.TAGS.SORT_NAME') },
  ];

  readonly selectedTags = signal<TagItem[]>([]);

  readonly isCreateMode = signal(false);
  private readonly formValid = signal(false);
  isFormValid(): boolean {
    return this.formValid();
  }
  private readonly onValidChange = (valid: boolean) => this.formValid.set(valid);

  private readonly formValues = signal({ name: '', description: '' });
  private readonly onValueChange = (name: string, description: string) =>
    this.formValues.set({ name, description });

  private readonly currentEditTag = signal<TagItem | null>(null);

  readonly allSelected = computed(
    () =>
      this.store.items().length > 0 &&
      this.store.items().every((tag) => this.selectedTags().some((s) => s.id === tag.id)),
  );
  readonly someSelected = computed(
    () =>
      this.store.items().some((tag) => this.selectedTags().some((s) => s.id === tag.id)) &&
      !this.allSelected(),
  );

  ngOnInit(): void {
    void this.store.loadTags();
  }

  isTagSelected(item: TagItem): boolean {
    return this.selectedTags().some((t) => t.id === item.id);
  }

  toggleItemSelection(item: TagItem, checked: boolean): void {
    if (checked) {
      this.selectedTags.update((tags) => [...tags, item]);
    } else {
      this.selectedTags.update((tags) => tags.filter((t) => t.id !== item.id));
    }
  }

  toggleAllSelection(checked: boolean): void {
    if (checked) {
      this.selectedTags.set([...this.store.items()]);
    } else {
      this.selectedTags.set([]);
    }
  }

  onPageChange(page: number): void {
    this.selectedTags.set([]);
    void this.store.changePage(page);
  }

  onSortChange(sortBy: string | null): void {
    this.selectedTags.set([]);
    void this.store.changeSort(sortBy ?? '');
  }

  onOrderChange(order: string | null): void {
    this.selectedTags.set([]);
    void this.store.changeSortOrder(order ?? 'desc');
  }

  onCreateTag(): void {
    this.isCreateMode.set(true);
    this.formValid.set(false);
    this.formValues.set({ name: '', description: '' });
    this.currentEditTag.set(null);
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.LIBRARY.TAGS.ADD'),
        contentComponent: TagEditSettingsDialogComponent,
        contentComponentInputs: {
          onValidChange: this.onValidChange,
          onValueChange: this.onValueChange,
        },
        customActions: this.editTagCustomActions,
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '800px',
    });
  }

  onEditSettings(tag: TagItem): void {
    this.isCreateMode.set(false);
    this.formValid.set(false);
    this.formValues.set({ name: tag.name, description: tag.description ?? '' });
    this.currentEditTag.set(tag);
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.LIBRARY.TAGS.EDIT_SETTINGS.TITLE'),
        contentComponent: TagEditSettingsDialogComponent,
        contentComponentInputs: {
          item: tag,
          onValidChange: this.onValidChange,
          onValueChange: this.onValueChange,
        },
        customActions: this.editTagCustomActions,
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '800px',
    });
  }

  closeEditTagDialog(): void {
    this.dialog.closeAll();
  }

  async saveEditTag(): Promise<void> {
    const { name, description } = this.formValues();
    const tag = this.currentEditTag();
    const payload = { name, description: description || undefined };

    const success = tag
      ? await this.store.updateTag(tag.id, payload)
      : await this.store.createTag(payload);

    if (success) {
      this.dialog.closeAll();
      return;
    }

    this.toast.error(
      this.translate.instant(
        tag ? 'ADMIN.LIBRARY.TAGS.UPDATE_FAILED' : 'ADMIN.LIBRARY.TAGS.CREATE_FAILED',
      ),
    );
  }

  onDeselectAll(): void {
    this.selectedTags.set([]);
  }

  onDeleteTag(tag: TagItem): void {
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
          this.dialog.closeAll();
          void this.store.deleteTag(tag.id).then(() => {
            this.selectedTags.update((tags) => tags.filter((t) => t.id !== tag.id));
          });
        },
        cancelAction: () => this.dialog.closeAll(),
        buttonAlign: 'center',
      } as DialogData,
      width: '800px',
    });
  }

  onDeleteTags(tags: TagItem[]): void {
    const ids = tags.map((t) => t.id);
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
          this.dialog.closeAll();
          void this.store.deleteTags(ids).then(() => {
            this.selectedTags.set([]);
          });
        },
        cancelAction: () => this.dialog.closeAll(),
        buttonAlign: 'center',
      } as DialogData,
      width: '800px',
    });
  }
}
