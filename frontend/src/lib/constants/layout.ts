import type { UserMenuAction } from '@/types/layout';

export const USER_MENU_ACTIONS: UserMenuAction[] = [
  { labelKey: 'USER_MENU.PASSWORD_SETTINGS', action: 'password' },
  { labelKey: 'USER_MENU.LOGOUT', action: 'logout', danger: true, separator: true },
];
