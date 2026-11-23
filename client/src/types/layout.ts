import type { MaterialSymbol } from 'material-symbols';
import type { SvgIconName } from '@/components/shared/icons/svg-icon-paths';

// 移植元 src/types/layout.type.ts・layout.config.ts・admin-sidebar.component.ts の型

/** サイドバーのナビ項目（通常モード）。roomId・hasPin・hasMenu・badge はルーム一覧（#285）で使う */
export interface MenuItem {
  labelKey: string;
  route?: string;
  icon?: string;
  iconType?: 'svg' | 'image';
  roomId?: string;
  hasPin?: boolean;
  hasMenu?: boolean;
  badge?: string | number;
}

export interface SectionGroup {
  labelKey: string;
  collapsed: boolean;
  items: MenuItem[];
}

export type UserMenuActionType = 'password' | 'check-credit' | 'switch-role' | 'logout';

export interface UserMenuAction {
  icon: MaterialSymbol;
  labelKey: string;
  action: UserMenuActionType;
  iconClass?: string;
  textClass?: string;
  separator?: boolean;
}

export interface ActionItem {
  icon: SvgIconName;
  labelKey: string;
  /** '#' で始まるものは遷移せず、ボタンとして動く（移植元と同じ） */
  route: string;
}

export interface LayoutConfig {
  dashboardRoute: string;
  chatNewRoute: string;
  /** ルーム一覧（#285）で各ルームのリンク先を作る */
  chatRoomRoute: (roomId: string) => string;
  adminTenantRoute: string;
  externalSiteUrl: string;
  /** 管理モードにする URL の前方一致キーと、その画面のタイトルキー */
  adminTitleMap: Record<string, string>;
  actionItems: ActionItem[];
  sectionGroups: SectionGroup[];
  userMenuActions: UserMenuAction[];
}

export interface AdminMenuItem {
  icon: MaterialSymbol;
  labelKey: string;
  route: string;
}

export interface AdminMenuSection {
  labelKey: string;
  items: AdminMenuItem[];
}

/** 移植元 UiStore の SidebarMode（'library-detail' は移植元でも使われていないため持たない） */
export type SidebarMode = 'default' | 'admin' | 'back';
