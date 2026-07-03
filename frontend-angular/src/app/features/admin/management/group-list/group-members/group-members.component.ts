import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router } from '@angular/router';
import type { TabItem } from '@app-types/tab.type';
import { UiStore } from '@core/stores/ui.store';
import { TableColumn } from '@shared/components/table/table.interface';
import { TranslateModule } from '@ngx-translate/core';
import {
  ButtonComponent,
  DialogComponent,
  PageHeaderComponent,
  PaginationComponent,
  SelectComponent,
  TableComponent,
} from '@shared/components';
import { SelectOption } from '@app-types/common';
import { SearchInputComponent } from '@app/shared/components/input/search-input.component';

interface GroupMember {
  id: string;
  name: string;
  role: 'グループ管理者' | '一般';
  selected: boolean;
}

interface Assistant {
  id: string;
  name: string;
  description: string;
  cloud: 'クラウド' | 'SAAS_CHAT';
  model: string;
  expiry: string;
  enabled: boolean;
  selected: boolean;
}

@Component({
  selector: 'app-group-members',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatDialogModule,
    TranslateModule,
    TableComponent,
    PaginationComponent,
    SelectComponent,
    ButtonComponent,
    PageHeaderComponent,
    SearchInputComponent,
  ],
  templateUrl: './group-members.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col h-full',
  },
})
export class GroupMembersComponent implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);
  readonly uiStore = inject(UiStore);

  // Template references using viewChild()
  readonly actionsTemplate = viewChild.required<TemplateRef<unknown>>('actionsTemplate');
  readonly descriptionTemplate = viewChild.required<TemplateRef<unknown>>('descriptionTemplate');
  readonly statusTemplate = viewChild.required<TemplateRef<unknown>>('statusTemplate');
  readonly addUserContent = viewChild.required<TemplateRef<unknown>>('addUserContent');
  readonly addAssistantContent = viewChild.required<TemplateRef<unknown>>('addAssistantContent');
  readonly editGroupContent = viewChild.required<TemplateRef<unknown>>('editGroupContent');
  readonly deleteAction = viewChild.required<TemplateRef<unknown>>('deleteAction');
  readonly roleTemplate = viewChild.required<TemplateRef<unknown>>('roleTemplate');

  // Form data for dialogs
  readonly addUserFormData = signal<{ selectedUsers: string[] }>({
    selectedUsers: [],
  });

  readonly addAssistantFormData = signal<{ selectedAssistants: string[] }>({
    selectedAssistants: [],
  });

  readonly groupFormData = signal<{ groupName: string }>({
    groupName: '',
  });

  readonly groupId = signal<string>('');
  readonly groupName = signal<string>('チームA');
  readonly activeTabId = signal<string>('users');
  searchTerm = signal('');
  filterType = signal('全ユーザー');

  readonly tabs = signal<TabItem[]>([
    { id: 'users', label: '所属ユーザー' },
    { id: 'assistants', label: '所属アシスタント' },
  ]);

  readonly filterOptions: SelectOption[] = [
    { label: '全ユーザー', value: '全ユーザー' },
    { label: '自分のみ', value: '自分のみ' },
    { label: '他ユーザーのみ', value: '他ユーザーのみ' },
  ];

  readonly assistantFilterOptions: SelectOption[] = [
    { label: '全アシスタント', value: '全アシスタント' },
    { label: 'クラウド', value: 'クラウド' },
    { label: 'SAAS_CHAT', value: 'SAAS_CHAT' },
  ];

  readonly columns = signal<TableColumn[]>([]);
  readonly selectedMembers = signal<GroupMember[]>([]);
  readonly selectedAssistants = signal<Assistant[]>([]);

  readonly hasSelection = computed(() => {
    return this.activeTabId() === 'users'
      ? this.selectedMembers().length > 0
      : this.selectedAssistants().length > 0;
  });

  constructor() {
    // Get group ID from route params
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.groupId.set(id);
    }

    // Get group data from navigation state
    const navigation = this.router.currentNavigation();
    const state = navigation?.extras?.state || window.history.state;
    if (state?.['group']) {
      this.groupName.set(state['group'].name);
    }
  }

  ngAfterViewInit() {
    this.updateColumns();
  }

  private updateColumns() {
    if (this.activeTabId() === 'users') {
      this.columns.set([
        {
          field: 'name',
          header: 'ユーザー',
          sortable: true,
          width: '30%',
        },
        {
          field: 'role',
          header: '権限',
          sortable: true,
          width: '70%',
          template: this.roleTemplate(),
        },
      ]);
    } else {
      this.columns.set([
        {
          field: 'name',
          header: 'アシスタント',
          sortable: true,
          template: this.descriptionTemplate(),
          width: '40%',
        },
        {
          field: 'cloud',
          header: '接続サーバー',
          sortable: true,
          align: 'center',
          width: '18%',
        },
        {
          field: 'model',
          header: 'モデル',
          sortable: true,
          align: 'center',
          width: '18%',
        },
        {
          field: 'enabled',
          header: '履歴',
          sortable: false,
          template: this.statusTemplate(),
          align: 'center',
          width: '14%',
        },
        {
          field: 'actions',
          header: '',
          width: '32px',
          template: this.actionsTemplate(),
          align: 'center',
        },
      ]);
    }
  }

  // Mock data
  readonly members = signal<GroupMember[]>([
    { id: '1', name: '由宇名前', role: 'グループ管理者', selected: false },
    { id: '2', name: '由宇名前', role: '一般', selected: false },
    { id: '3', name: '由宇名前', role: 'グループ管理者', selected: false },
    { id: '4', name: '由宇名前', role: '一般', selected: false },
    { id: '5', name: '由宇名前', role: '一般', selected: false },
  ]);

  readonly assistants = signal<Assistant[]>([
    {
      id: '1',
      name: 'アシスタントの名称',
      description:
        'AssisDev05用の追加したアシスタントです AssisDev05ｇｏｔの2025年に作成したアシスタントです AssisDev05ｇｏｔの2025年に作成したアシスタントです',
      cloud: 'クラウド',
      model: 'gpt-4o-mini',
      expiry: '2024-07-18',
      enabled: true,
      selected: false,
    },
    {
      id: '2',
      name: 'アシスタントの名称',
      description: 'AssisDev05ｇｏｔの2025年に作成したアシスタントです',
      cloud: 'クラウド',
      model: 'gpt-4o-mini',
      expiry: '2024-07-18',
      enabled: true,
      selected: false,
    },
    {
      id: '3',
      name: 'アシスタントの名称',
      description:
        'AssisDev05ｇｏｔの2025年に作成したアシスタントです AssisDev05ｇｏｔの2025年に作成したアシスタントです',
      cloud: 'クラウド',
      model: 'SAAS_CHAT',
      expiry: '2024-07-18',
      enabled: true,
      selected: false,
    },
    {
      id: '4',
      name: 'アシスタントの名称',
      description: 'アシスタントの説明文',
      cloud: 'クラウド',
      model: 'SAAS_CHAT',
      expiry: '2024-07-18',
      enabled: true,
      selected: false,
    },
    {
      id: '5',
      name: 'アシスタントの名称',
      description: 'AssisDev05ｇｏｔの2025年に作成したアシスタントです',
      cloud: 'クラウド',
      model: 'gpt-4o-mini',
      expiry: '2024-07-18',
      enabled: true,
      selected: false,
    },
  ]);

  // Pagination
  readonly currentPage = signal(1);
  readonly pageSize = signal(10);

  readonly currentData = computed(() => {
    return this.activeTabId() === 'users' ? this.members() : this.assistants();
  });

  readonly totalPages = computed(() => {
    return Math.ceil(this.currentData().length / this.pageSize());
  });

  readonly paginatedData = computed(() => {
    const data = this.currentData();
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return data.slice(start, end);
  });

  onTabChange(tab: TabItem) {
    this.activeTabId.set(tab.id);
    this.currentPage.set(1);
    this.updateColumns();
  }

  onSelectionChange(selected: GroupMember[] | Assistant[]) {
    if (this.activeTabId() === 'users') {
      this.selectedMembers.set(selected as GroupMember[]);
    } else {
      this.selectedAssistants.set(selected as Assistant[]);
    }
  }

  onRowClick(member: GroupMember) {
    console.log('Row clicked:', member);
  }

  openMemberMenu(member: GroupMember, event: Event) {
    event.stopPropagation();
    console.log('Open menu for:', member);
  }

  onPageChange(page: number) {
    this.currentPage.set(page);
  }

  onPageSizeChange(size: number) {
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  onSearch(searchValue: string) {
    this.searchTerm.set(searchValue);
    console.log('Search:', searchValue);
  }

  addUser(): void {
    const isUsersTab = this.activeTabId() === 'users';

    if (isUsersTab) {
      this.addUserFormData.set({ selectedUsers: [] });
    } else {
      this.addAssistantFormData.set({ selectedAssistants: [] });
    }

    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: isUsersTab ? 'ユーザーの追加' : 'アシスタントの追加',
        content: isUsersTab ? this.addUserContent() : this.addAssistantContent(),
        confirmText: '作成',
        cancelText: 'キャンセル',
        showCancel: true,
        buttonAlign: 'right',
        showDivider: true,
      },
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        console.log(
          `Selected ${isUsersTab ? 'users' : 'assistants'}:`,
          isUsersTab ? this.addUserFormData() : this.addAssistantFormData(),
        );
        // TODO: Add logic to add users/assistants to the group
      }
    });
  }

  deleteSelected(): void {
    const items =
      this.activeTabId() === 'users' ? this.selectedMembers() : this.selectedAssistants();
    console.log(`Delete ${this.activeTabId()}:`, items);
    // TODO: Implement actual delete logic
  }

  goBack(): void {
    this.router.navigate(['/admin/groups']);
  }

  editGroup(): void {
    this.groupFormData.set({ groupName: this.groupName() });

    const dialogRef = this.dialog.open(DialogComponent, {
      data: {
        title: 'チームの編集',
        content: this.editGroupContent(),
        bottomLeftContent: this.deleteAction(),
        confirmText: '保存',
        cancelText: 'キャンセル',
        showCancel: true,
        buttonAlign: 'right',
        showDivider: true,
      },
    });

    dialogRef.afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.groupName.set(this.groupFormData().groupName);
        console.log('Updated group:', this.groupFormData());
      }
    });
  }

  deleteGroup(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      width: '750px',
      panelClass: 'delete-confirmation-dialog',
      data: {
        title: '削除の確認',
        message:
          'メッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入りますメッセージテキストが入ります',
        confirmText: '削除',
        cancelText: 'キャンセル',
        showCancel: true,
        buttonAlign: 'center',
      },
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        console.log('Delete group:', this.groupName());
        // TODO: Implement actual delete logic
        this.router.navigate(['/admin/groups']);
      }
    });
  }
}
