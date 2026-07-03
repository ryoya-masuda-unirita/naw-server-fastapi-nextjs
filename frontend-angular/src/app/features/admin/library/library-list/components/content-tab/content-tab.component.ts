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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, startWith, Subject } from 'rxjs';
import { ROUTES } from '@core/constants/routes.config';
import { ToastService } from '@core/services/toast.service';
import { UserService } from '@core/services/user.service';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PaginationComponent } from '@shared/components/pagination/pagination.component';
import { SelectComponent } from '@shared/components/select/select.component';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { TableComponent } from '@shared/components/table/table.component';
import { TableColumn } from '@shared/components/table/table.interface';
import { DialogComponent, DialogData } from '@shared/components/dialog/dialog.component';
import { ButtonComponent } from '@shared/components/button/button.component';
import { LibraryPageItem, LibraryUpdatePayload } from '@app-types/admin/library.types';
import {
  FormSortInputComponent,
  SortOption,
} from '@app/shared/components/form/form-sort-input/form-sort-input.component';
import { LibraryItemMenuComponent } from './library-item-menu.component';
import { LibraryEditSettingsDialogComponent } from './library-edit-settings-dialog.component';
import { SelectOption } from '@app-types/common';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import { SkeletonComponent } from '@shared/components/skeleton/skeleton.component';
import { LibraryStore, LibraryUserFilterMode } from './library.store';

@Component({
  selector: 'app-library-content-tab',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    PaginationComponent,
    SelectComponent,
    SearchInputComponent,
    TableComponent,
    FormSortInputComponent,
    LibraryItemMenuComponent,
    ButtonComponent,
    AppMatIconComponent,
    SkeletonComponent,
  ],
  templateUrl: './content-tab.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class ContentTabComponent implements OnInit {
  @ViewChild('nameTemplate', { static: true }) private nameTemplate!: TemplateRef<unknown>;
  @ViewChild('tagsTemplate', { static: true }) private tagsTemplate!: TemplateRef<unknown>;
  @ViewChild('dateTemplate', { static: true }) private dateTemplate!: TemplateRef<unknown>;
  @ViewChild('actionsTemplate', { static: true }) actionsTemplate!: TemplateRef<unknown>;
  @ViewChild('editSettingsHeaderTrailing', { static: true })
  private editSettingsHeaderTrailing!: TemplateRef<unknown>;
  @ViewChild('editSettingsCustomActions', { static: true })
  private editSettingsCustomActions!: TemplateRef<unknown>;
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly store = inject(LibraryStore);
  private readonly toast = inject(ToastService);
  private readonly userService = inject(UserService);

  // ライブラリの所有者でない場合、バックエンドの更新/削除APIは404を返すため、編集・削除メニューの
  // 表示可否を所有者判定で出し分ける。一覧の作成者ID(item.userId)と /users/profile が返す
  // ログインユーザのUUID(id)はいずれも User の UUID なので、この2つの一致で判定する。
  private readonly currentUserId = computed(() => this.userService.profileQuery.data()?.id ?? '');
  readonly isOwner = (item: LibraryPageItem): boolean =>
    !!item.userId && item.userId === this.currentUserId();

  private readonly searchSubject = new Subject<string>();

  readonly dialogLinkCopied = signal(false);
  readonly sortField = signal<string | null>('updatedAt');
  readonly sortOrder = signal<string>('desc');

  constructor() {
    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((value) => void this.store.changeTitle(value));
  }

  private readonly langChange = toSignal(
    this.translateService.onLangChange.pipe(
      startWith(null),
      map(() => this.translateService.currentLang),
    ),
  );

  readonly sortFieldOptions: SortOption[] = [
    { value: 'updatedAt', label: '更新日時順' },
    { value: 'title', label: 'コンテンツ名順' },
  ];

  readonly userFilterOptions = computed<SelectOption[]>(() => {
    this.langChange();
    return [
      {
        value: '',
        label: this.translateService.instant('ADMIN.LIBRARY.ALL_USERS') || '全てのユーザー',
      },
      {
        value: 'mine',
        label: this.translateService.instant('ADMIN.LIBRARY.ONLY_MINE') || '自分のみ',
      },
      {
        value: 'others',
        label: this.translateService.instant('ADMIN.LIBRARY.ONLY_OTHERS') || '他ユーザーのみ',
      },
    ];
  });

  readonly tagFilterOptions = computed<SelectOption[]>(() => {
    this.langChange();
    return [
      { value: '', label: this.translateService.instant('ADMIN.LIBRARY.ALL_TAGS') || '全てのタグ' },
      ...this.store.tagOptions().map((t) => ({ value: t.id, label: t.name })),
    ];
  });

  readonly filterUser = signal<LibraryUserFilterMode>('');
  readonly filterTag = signal<string>('');
  readonly searchInput = signal<string>('');

  readonly items = this.store.items;
  readonly isLoading = this.store.isLoading;
  readonly totalPages = this.store.totalPages;
  readonly countDisplay = this.store.countDisplay;
  readonly currentPage = this.store.currentPage;

  readonly columns = signal<TableColumn[]>([]);

  private pendingEditItemId: string | null = null;
  private readonly editFormValues = signal<LibraryUpdatePayload>({
    name: '',
    tags: [],
    groups: [],
  });
  private readonly onEditValueChange = (payload: LibraryUpdatePayload): void =>
    this.editFormValues.set(payload);

  ngOnInit(): void {
    this.columns.set([
      {
        field: 'title',
        header: 'コンテンツ名',
        template: this.nameTemplate,
        hasBorder: true,
      },
      { field: 'tags', header: 'タグ', template: this.tagsTemplate, width: 'w-82.5' },
      {
        field: 'updatedAt',
        header: '更新日時',
        width: 'w-30',
        template: this.dateTemplate,
      },
    ]);
    void this.store.loadLibraries();
  }

  onPageChange(page: number): void {
    void this.store.changePage(page);
  }

  onSearchValueChange(value: string): void {
    this.searchInput.set(value);
    this.searchSubject.next(value);
  }

  onUserFilterChange(value: string | null): void {
    const mode = (value ?? '') as LibraryUserFilterMode;
    this.filterUser.set(mode);
    void this.store.changeUserMode(mode);
  }

  onTagFilterChange(value: string | null): void {
    const tagId = value ?? '';
    this.filterTag.set(tagId);
    void this.store.changeTagFilter(tagId);
  }

  onSortFieldChange(): void {
    void this.store.changeSort(this.sortField() || 'updatedAt', this.sortOrder());
  }

  onSortOrderChange(): void {
    void this.store.changeSort(this.sortField() || 'updatedAt', this.sortOrder());
  }

  onItemAction(item: LibraryPageItem): void {
    this.router.navigate([ROUTES.APP.LIBRARY_DETAIL(item.id)]);
  }

  onEditSettings(item: LibraryPageItem): void {
    this.dialogLinkCopied.set(false);
    this.pendingEditItemId = item.id;
    this.editFormValues.set({
      name: item.title,
      tags: item.tags.map((t) => t.id),
      groups: item.sharedGroups.map((g) => g.id),
    });
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translateService.instant('ADMIN.LIBRARY.EDIT_SETTINGS.TITLE'),
        headerTrailing: this.editSettingsHeaderTrailing,
        contentComponent: LibraryEditSettingsDialogComponent,
        contentComponentInputs: {
          item,
          onValueChange: this.onEditValueChange,
        },
        customActions: this.editSettingsCustomActions,
        showDefaultActions: false,
        buttonAlign: 'right',
      } as DialogData,
      width: '800px',
    });
  }

  closeEditSettingsDialog(): void {
    this.dialog.closeAll();
  }

  async saveEditSettings(): Promise<void> {
    if (!this.pendingEditItemId) {
      this.dialog.closeAll();
      return;
    }
    const success = await this.store.updateItem(this.pendingEditItemId, this.editFormValues());
    if (success) {
      this.dialog.closeAll();
      return;
    }
    this.toast.error(this.translateService.instant('ADMIN.LIBRARY.UPDATE_FAILED'));
  }

  onDialogCopyLink(): void {
    if (!this.pendingEditItemId) {
      return;
    }
    void this.copyLibraryDetailUrl(this.pendingEditItemId);
    this.dialogLinkCopied.set(true);
    setTimeout(() => this.dialogLinkCopied.set(false), 3000);
  }

  onCopyLink(item: LibraryPageItem): void {
    void this.copyLibraryDetailUrl(item.id);
  }

  private copyLibraryDetailUrl(libraryId: string): Promise<void> {
    const url = `${window.location.origin}${ROUTES.APP.LIBRARY_DETAIL(libraryId)}`;
    return navigator.clipboard.writeText(url);
  }

  onDeleteItem(item: LibraryPageItem): void {
    this.dialog.open(DialogComponent, {
      data: {
        title: this.translateService.instant('ADMIN.LIBRARY.DELETE.TITLE'),
        message: this.translateService.instant('ADMIN.LIBRARY.DELETE.MESSAGE'),
        cancelText: this.translateService.instant('COMMON.CANCEL'),
        confirmText: this.translateService.instant('COMMON.DELETE'),
        showCancel: true,
        showConfirm: true,
        confirmDanger: true,
        confirmIcon: 'delete',
        confirmAction: async () => {
          const success = await this.store.deleteItem(item.id);
          if (success) {
            this.dialog.closeAll();
            return;
          }
          this.toast.error(this.translateService.instant('ADMIN.LIBRARY.DELETE_FAILED'));
        },
        cancelAction: () => this.dialog.closeAll(),
        buttonAlign: 'center',
      } as DialogData,
      width: '800px',
    });
  }
}
