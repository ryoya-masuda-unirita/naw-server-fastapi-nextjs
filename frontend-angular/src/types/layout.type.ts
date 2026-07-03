export type LayoutRole = 'admin' | 'user';

export interface MenuItem {
  icon?: string;
  iconType?: 'material' | 'svg' | 'image' | 'component';
  labelKey: string;
  route?: string;
  badge?: number;
  isParent?: boolean;
  hasPin?: boolean;
  hasMenu?: boolean;
  roomId?: string;
  children?: MenuItem[];
}

export interface SectionGroup {
  labelKey: string;
  collapsed: boolean;
  items: MenuItem[];
}

export interface UserMenuAction {
  icon: string;
  labelKey: string;
  iconClass?: string;
  textClass?: string;
  trailingIcon?: string;
  trailingIconClass?: string;
  action: string;
  separator?: boolean;
}

export interface LayoutConfig {
  role: LayoutRole;
  dashboardRoute: string;
  chatNewRoute: string;
  chatSearchRoute: string;
  chatRoomRoute: (roomId: string) => string;
  libraryRoute: string;
  adminRoute: string;
  adminTenantRoute: string;
  externalSiteUrl: string;
  adminTitleMap: Record<string, string>;
  actionItems: MenuItem[];
  sectionGroups: SectionGroup[];
  userMenuActions: UserMenuAction[];
}
