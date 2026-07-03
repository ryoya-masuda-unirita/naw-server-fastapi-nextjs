import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PaginationComponent } from '@shared/components';
import { SearchInputComponent } from '@shared/components/input/search-input.component';
import { SelectComponent } from '@shared/components/select/select.component';
import {
  FormSortInputComponent,
  SortOption,
} from '@shared/components/form/form-sort-input/form-sort-input.component';
import { SelectOption } from '@app-types/common';
import type {
  GroupMemberUserSortField,
  GroupUserRole,
} from '@app-types/admin/group-management.types';
import { ROLES } from '../../../../group-list.constants';
import type { GroupSortOrder } from '@app-types/admin/group-management.types';

export interface GroupUsersFilterChange {
  query: string;
  role: GroupUserRole | 'all';
  sortField: GroupMemberUserSortField;
  sortOrder: GroupSortOrder;
}

@Component({
  selector: 'app-group-users-filter',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    PaginationComponent,
    SearchInputComponent,
    SelectComponent,
    FormSortInputComponent,
  ],
  templateUrl: './group-users-filter.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupUsersFilterComponent {
  private readonly translate = inject(TranslateService);

  readonly pageIndex = input<number>(1);
  readonly totalPages = input<number>(1);
  readonly countDisplay = input<string>('');

  readonly pageIndexChange = output<number>();
  readonly filterChange = output<GroupUsersFilterChange>();

  readonly searchQuery = signal<string>('');
  readonly filterRole = signal<GroupUserRole | 'all'>('all');
  readonly sortField = signal<GroupMemberUserSortField>('updatedAt');
  readonly sortOrder = signal<GroupSortOrder>('desc');

  private readonly currentLang = signal<string>(this.translate.currentLang);

  constructor() {
    this.translate.onLangChange.subscribe((event) => this.currentLang.set(event.lang));
  }

  readonly roleOptions = computed<SelectOption[]>(() => {
    this.currentLang();
    return [
      { value: ROLES.ALL, label: this.translate.instant('GROUPS.ALL_ROLES') },
      { value: ROLES.ADMIN, label: this.translate.instant('GROUPS.ROLE_ADMIN') },
      { value: ROLES.MEMBER, label: this.translate.instant('GROUPS.ROLE_MEMBER') },
    ];
  });

  readonly sortFieldOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'updatedAt', label: this.translate.instant('GROUPS.SORT_BY_ADDED') },
      { value: 'name', label: this.translate.instant('GROUPS.SORT_BY_USER_NAME') },
      { value: 'role', label: this.translate.instant('GROUPS.SORT_BY_ROLE') },
    ];
  });

  readonly sortOrderOptions = computed<SortOption[]>(() => {
    this.currentLang();
    return [
      { value: 'asc', label: this.translate.instant('GROUPS.SORT_ASC') },
      { value: 'desc', label: this.translate.instant('GROUPS.SORT_DESC') },
    ];
  });

  onSearchChange(value: string) {
    this.searchQuery.set(value);
    this.emit();
  }

  onRoleChange(value: string | null) {
    this.filterRole.set((value as GroupUserRole | 'all' | null) ?? 'all');
    this.emit();
  }

  onSortFieldChange(value: string | null) {
    this.sortField.set((value as GroupMemberUserSortField) ?? 'updatedAt');
    this.emit();
  }

  onSortOrderChange(value: string) {
    this.sortOrder.set(value as GroupSortOrder);
    this.emit();
  }

  onPageChange(page: number) {
    this.pageIndexChange.emit(page);
  }

  private emit() {
    this.filterChange.emit({
      query: this.searchQuery(),
      role: this.filterRole(),
      sortField: this.sortField(),
      sortOrder: this.sortOrder(),
    });
  }
}
