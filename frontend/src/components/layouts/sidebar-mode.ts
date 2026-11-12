import { PARENT_OF_SCREEN_USE_BACK_SIDEBAR, SCREEN_USE_BACK_SIDEBAR } from '@/lib/constants/layout';
import type { LayoutConfig, SidebarMode } from '@/types/layout';

/** 管理コンソールの画面か（移植元 sidebar.component.ts の isAdminManagementRoute） */
export function isAdminManagementRoute(url: string, config: LayoutConfig): boolean {
  return Object.keys(config.adminTitleMap).some((route) => url.startsWith(route));
}

/**
 * URL からサイドバーのモードを決める。
 * 移植元は遷移のたびに URL から UiStore のモードを設定しており（checkAdminRoute・checkUseBackSidebar）、
 * モードは URL だけで決まるため、React ではストアに持たずその場で導出する。
 */
export function resolveSidebarMode(url: string, config: LayoutConfig): SidebarMode {
  if (isAdminManagementRoute(url, config)) {
    return 'admin';
  }

  const isUseBackSidebar =
    SCREEN_USE_BACK_SIDEBAR.some((path) => url.includes(path)) &&
    PARENT_OF_SCREEN_USE_BACK_SIDEBAR.every((path) => path !== url);

  return isUseBackSidebar ? 'back' : 'default';
}
