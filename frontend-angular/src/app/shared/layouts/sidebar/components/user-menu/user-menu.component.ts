import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import type { UserMenuAction } from '@app-types/layout.type';
import { canAccessAdminConsole } from '@core/utils/auth.helpers';
import { ContextMenuComponent } from '@shared/components/context-menu/context-menu.component';

@Component({
  selector: 'app-user-menu',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, ContextMenuComponent],
  templateUrl: './user-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserMenuComponent {
  @ViewChild(ContextMenuComponent) contextMenu!: ContextMenuComponent;

  readonly userMenuActions = input.required<UserMenuAction[]>();
  readonly userName = input<string>('');
  readonly avatarUrl = input<string>('/icons/default-avt-icon.svg');
  readonly sidebarCollapsed = input<boolean>(false);
  readonly buttonClass = input<string>('');
  readonly menuAction = output<UserMenuAction>();

  readonly canShowSwitchRole = computed(() => canAccessAdminConsole());

  onMenuAction(action: UserMenuAction): void {
    this.menuAction.emit(action);
    this.contextMenu?.close();
  }

  toggle(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.contextMenu?.toggle(event || new Event('click'));
  }
}
