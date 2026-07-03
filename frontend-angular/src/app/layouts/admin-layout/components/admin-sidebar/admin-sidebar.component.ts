import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

import { AuthStore } from '@core/stores/auth.store';
import { UiStore } from '@core/stores/ui.store';
import { ROUTES } from '@core/constants/routes.config';

interface MenuItem {
  icon: string;
  labelKey: string;
  route: string;
}

interface MenuSection {
  labelKey: string;
  items: MenuItem[];
}

const FULL_MENU_SECTIONS: MenuSection[] = [
  {
    labelKey: 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
    items: [
      {
        icon: 'workspaces',
        labelKey: 'ADMIN_CONSOLE.WORKSPACE_SETTINGS',
        route: ROUTES.APP.ADMIN_TENANT,
      },
      {
        icon: 'article_person',
        labelKey: 'ADMIN_CONSOLE.USER_MANAGEMENT',
        route: ROUTES.APP.ADMIN_USERS,
      },
      {
        icon: 'groups',
        labelKey: 'ADMIN_CONSOLE.TEAM_MANAGEMENT',
        route: ROUTES.APP.ADMIN_GROUPS,
      },
    ],
  },
  {
    labelKey: 'ADMIN_CONSOLE.SERVICE_SETTINGS',
    items: [
      {
        icon: 'smart_toy',
        labelKey: 'SIDEBAR.ASSISTANTS',
        route: ROUTES.APP.ADMIN_ASSISTANTS,
      },
      {
        icon: 'history',
        labelKey: 'SIDEBAR.CHAT_HISTORY',
        route: ROUTES.APP.ADMIN_CHAT_HISTORY,
      },
      {
        icon: 'database',
        labelKey: 'SIDEBAR.TRAINING_DATA',
        route: ROUTES.APP.ADMIN_TRAINING_DATA,
      },
      {
        icon: 'thumbs_up_double',
        labelKey: 'SIDEBAR.FEEDBACK',
        route: ROUTES.APP.ADMIN_FEEDBACK,
      },
      {
        icon: 'terminal',
        labelKey: 'SIDEBAR.TEMPLATES',
        route: ROUTES.APP.ADMIN_TEMPLATES,
      },
    ],
  },
];

const GROUP_ADMIN_MENU_SECTIONS: MenuSection[] = [
  {
    labelKey: 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
    items: [
      {
        icon: 'groups',
        labelKey: 'ADMIN_CONSOLE.TEAM_MANAGEMENT',
        route: ROUTES.APP.ADMIN_GROUPS,
      },
    ],
  },
];

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatIconModule, TranslateModule],
  templateUrl: './admin-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSidebarComponent {
  readonly authStore = inject(AuthStore);
  readonly uiStore = inject(UiStore);

  readonly menuSections = computed(() =>
    this.authStore.isGroupAdminOnly() ? GROUP_ADMIN_MENU_SECTIONS : FULL_MENU_SECTIONS,
  );
}
