import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';
import { AppMatIconComponent } from '@shared/components/icons/mat-icon.component';
import type { AdminUser } from '@app-types/admin/user.types';

@Component({
  selector: 'app-user-list-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, ContextMenuComponent, AppMatIconComponent],
  templateUrl: './user-list-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
})
export class UserListMenuComponent {
  readonly item = input.required<AdminUser>();

  readonly editUser = output<AdminUser>();
  readonly deleteUser = output<void>();

  onEditUser(event: Event): void {
    event.stopPropagation();
    this.editUser.emit(this.item());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteUser.emit();
  }
}
