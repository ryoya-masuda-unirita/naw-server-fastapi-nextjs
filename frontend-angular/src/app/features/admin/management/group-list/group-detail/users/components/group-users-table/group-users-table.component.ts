import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { TableListComponent, TableListItemComponent } from '@shared/components';
import { IconButtonComponent } from '@shared/components/icon-button/icon-button.component';
import { SvgIconComponent } from '@shared/components/icons/svg-icon.component';
import { UserApiItem } from '@app-types/admin/user.types';
import { User } from '@features/auth/types';
import { matchesCurrentUser } from '@core/utils/auth.helpers';

@Component({
  selector: 'app-group-users-table',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TableListComponent,
    TableListItemComponent,
    IconButtonComponent,
    SvgIconComponent,
  ],
  templateUrl: './group-users-table.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupUsersTableComponent {
  readonly items = input.required<UserApiItem[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly allSelected = input<boolean>(false);
  readonly someSelected = input<boolean>(false);
  readonly openMenuId = input<string | null>(null);
  readonly currentUser = input<User | null>(null);

  readonly selectAllChange = output<boolean>();
  readonly itemSelectChange = output<{ id: string; checked: boolean }>();
  readonly editRole = output<UserApiItem>();
  readonly removeUser = output<UserApiItem>();
  readonly toggleMenu = output<string>();

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  isCurrentUser(item: UserApiItem): boolean {
    return matchesCurrentUser(item, this.currentUser());
  }

  roleLabelKey(item: UserApiItem): string {
    return item.groupAdmin ? 'GROUPS.ROLE_ADMIN' : 'GROUPS.ROLE_MEMBER';
  }

  formatCredits(value: number | null | undefined): string {
    if (value == null) return '—';
    return value.toLocaleString('ja-JP');
  }
}
