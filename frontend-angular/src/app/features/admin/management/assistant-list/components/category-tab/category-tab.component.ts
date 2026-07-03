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
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { AssistantCategoryApiItem } from '@app-types/admin/assistant.types';
import {
  FormSortInputComponent,
  SortOption,
} from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { SvgIconComponent } from '@app/shared/components/icons/svg-icon.component';
import { ToastService } from '@core/services/toast.service';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent,
  DialogComponent,
  PaginationComponent,
  TableListComponent,
  TableListItemComponent,
} from '@shared/components';
import { AssistantListApiService } from '../../services/assistant-list-api.service';
import { AssistantCategoryListStore } from '../../stores/assistant-category-list.store';
import { CategoryAddDialogComponent } from './components/category-add-dialog.component';
import { CategoryEditDialogComponent } from './components/category-edit-dialog.component';
import { CategoryTabMenuComponent } from './components/category-tab-menu.component';

@Component({
  selector: 'app-category-tab',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    ButtonComponent,
    PaginationComponent,
    FormSortInputComponent,
    SvgIconComponent,
    CategoryTabMenuComponent,
    TableListComponent,
    TableListItemComponent,
    CategoryAddDialogComponent,
    CategoryEditDialogComponent,
  ],
  templateUrl: './category-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'term-main md:pb-0',
  },
})
export class CategoryTabComponent implements OnInit {
  readonly store = inject(AssistantCategoryListStore);
  private readonly translate = inject(TranslateService);
  private readonly dialog = inject(MatDialog);
  private readonly assistantApi = inject(AssistantListApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);

  @ViewChild('addCategoryContent') addCategoryContent!: TemplateRef<unknown>;
  @ViewChild('editCategoryContent') editCategoryContent!: TemplateRef<unknown>;
  @ViewChild('deleteMessageContent') deleteMessageContent!: TemplateRef<unknown>;

  readonly selectedCategories = signal<AssistantCategoryApiItem[]>([]);

  readonly addForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(16)]],
    description: ['', [Validators.maxLength(255)]],
  });

  readonly editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(16)]],
    description: ['', [Validators.maxLength(255)]],
  });

  readonly isAddSubmitting = signal(false);
  readonly isEditSubmitting = signal(false);
  private editingId: string | null = null;

  readonly sortFieldOptions: SortOption[] = [
    {
      value: 'updatedAt',
      label: this.translate.instant('ADMIN.ASSISTANT.SORT_UPDATED_AT'),
    },
    { value: 'name', label: this.translate.instant('ADMIN.ASSISTANT.SORT_CATEGORY_NAME') },
  ];

  ngOnInit() {
    this.store.loadItems();
  }

  // Selection
  readonly allSelected = computed(() => {
    const items = this.store.items();
    return items.length > 0 && this.selectedCategories().length === items.length;
  });

  readonly someSelected = computed(() => {
    return this.selectedCategories().length > 0 && !this.allSelected();
  });

  selectAllChange(checked: boolean) {
    if (checked) {
      this.selectedCategories.set([...this.store.items()]);
    } else {
      this.selectedCategories.set([]);
    }
  }

  isSelected(id: string): boolean {
    return this.selectedCategories().some((item) => item.id === id);
  }

  toggleItemSelection(category: AssistantCategoryApiItem, checked: boolean): void {
    if (checked) {
      this.selectedCategories.update((items) => [...items, category]);
    } else {
      this.selectedCategories.update((items) => items.filter((a) => a.id !== category.id));
    }
  }

  onDeselectAll(): void {
    this.selectedCategories.set([]);
  }

  // Filter & Pagination
  onSortChange(field: string | null, order: string | null) {
    this.store.updateFilter({
      sortField: field as any,
      sortOrder: order as any,
    });
  }

  onPageChange(page: number): void {
    this.store.updateFilter({ pageIndex: page - 1 });
  }

  // ─── Add Category ────────────────────────────────────────────
  onAddCategory(): void {
    this.addForm.reset({ name: '', description: '' });
    this.isAddSubmitting.set(false);

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.CREATE_CATEGORY'),
        content: this.addCategoryContent,
        confirmText: this.translate.instant('COMMON.CREATE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmMinWidth: 'min-w-[98.5px]',
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => this.submitAddCategory(ref);
  }

  private async submitAddCategory(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.addForm.invalid || this.isAddSubmitting()) {
      this.addForm.markAllAsTouched();
      this.addForm.updateValueAndValidity();
      return;
    }

    try {
      this.isAddSubmitting.set(true);
      const value = this.addForm.getRawValue();
      const created = await this.assistantApi.createCategory({
        name: value.name.trim(),
        description: value.description.trim(),
      });
      this.store.addOne(created);
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.CREATE_CATEGORY_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      this.toast.error(this.translate.instant('TEMPLATES.CREATE_FAILED'));
    } finally {
      this.isAddSubmitting.set(false);
    }
  }

  // ─── Edit Category ───────────────────────────────────────────
  onEditCategory(category: AssistantCategoryApiItem): void {
    this.editingId = category.id;
    this.editForm.reset({
      name: category.name,
      description: category.description,
    });
    this.isEditSubmitting.set(false);

    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.EDIT_CATEGORY'),
        content: this.editCategoryContent,
        confirmText: this.translate.instant('COMMON.SAVE'),
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmMinWidth: 'min-w-[98.5px]',
        showCancel: true,
        showConfirm: true,
        buttonAlign: 'right',
        showDivider: true,
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => this.submitEditCategory(ref);
  }

  private async submitEditCategory(ref: MatDialogRef<DialogComponent>): Promise<void> {
    if (this.editForm.invalid || this.isEditSubmitting() || !this.editingId) {
      this.editForm.markAllAsTouched();
      this.editForm.updateValueAndValidity();
      return;
    }

    try {
      this.isEditSubmitting.set(true);
      const value = this.editForm.getRawValue();
      const updated = await this.assistantApi.updateCategory(this.editingId, {
        name: value.name.trim(),
        description: value.description.trim(),
      });
      this.store.updateOne(this.editingId, updated);
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.UPDATE_CATEGORY_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      this.toast.error(this.translate.instant('TEMPLATES.UPDATE_FAILED'));
    } finally {
      this.isEditSubmitting.set(false);
    }
  }

  // ─── Delete ──────────────────────────────────────────────────
  onDeleteCategory(category: AssistantCategoryApiItem): void {
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.DELETE_CATEGORY_TITLE'),
        content: this.deleteMessageContent,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        confirmMinWidth: 'min-w-30.5',
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'center',
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () =>
      this.submitDeleteCategories(ref, [category.id]);
  }

  onDeleteSelected(): void {
    const ids = this.selectedCategories().map((c) => c.id);
    const ref = this.dialog.open(DialogComponent, {
      data: {
        title: this.translate.instant('ADMIN.ASSISTANT.DELETE_CATEGORY_TITLE'),
        content: this.deleteMessageContent,
        cancelText: this.translate.instant('COMMON.CANCEL'),
        confirmText: this.translate.instant('COMMON.DELETE'),
        confirmMinWidth: 'min-w-30.5',
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        buttonAlign: 'center',
      },
      width: '800px',
    });

    ref.componentInstance.data.confirmAction = () => this.submitDeleteCategories(ref, ids);
  }

  private async submitDeleteCategories(
    ref: MatDialogRef<DialogComponent>,
    ids: string[],
  ): Promise<void> {
    try {
      await Promise.all(ids.map((id) => this.assistantApi.deleteCategory(id)));
      this.store.removeMany(ids); // I should add removeMany to the store
      this.selectedCategories.set(this.selectedCategories().filter((c) => !ids.includes(c.id)));
      this.toast.success(this.translate.instant('ADMIN.ASSISTANT.DELETE_CATEGORY_SUCCESS'));
      ref.close();
    } catch (err) {
      console.log(err);
      this.toast.error(this.translate.instant('TEMPLATES.DELETE_FAILED'));
    }
  }
}
