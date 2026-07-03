export interface UserMenuAction {
  labelKey: string;
  action: 'password' | 'logout';
  danger?: boolean;
  separator?: boolean;
}
