import { ROUTES } from '@/lib/constants/routes';
import type { AdminMenuSection, LayoutConfig } from '@/types/layout';

/**
 * 移植元 shared/layouts/layout.config.ts の ADMIN_LAYOUT_CONFIG。
 * 移植元はログイン済みユーザー全員（一般ユーザーも）がこの設定のサイドバーを使う（USER_LAYOUT_CONFIG は未使用）。
 */
export const ADMIN_LAYOUT_CONFIG: LayoutConfig = {
  dashboardRoute: ROUTES.APP.DASHBOARD,
  chatNewRoute: ROUTES.APP.CHAT_NEW,
  chatRoomRoute: ROUTES.APP.CHAT_ROOM,
  libraryRoute: ROUTES.APP.LIBRARY,
  adminTenantRoute: ROUTES.APP.ADMIN_TENANT,
  externalSiteUrl: 'https://ranabase.com',
  adminTitleMap: {
    [ROUTES.APP.ADMIN_USERS]: 'ADMIN_CONSOLE.USER_MANAGEMENT',
    [ROUTES.APP.ADMIN_GROUPS]: 'ADMIN_CONSOLE.TEAM_MANAGEMENT',
    [ROUTES.APP.ADMIN_TENANT]: 'ADMIN_CONSOLE.WORKSPACE_SETTINGS',
    [ROUTES.APP.ADMIN_ASSISTANTS]: 'SIDEBAR.ASSISTANTS',
    [ROUTES.APP.ADMIN_CHAT_HISTORY]: 'SIDEBAR.CHAT_HISTORY',
    [ROUTES.APP.ADMIN_TRAINING_DATA]: 'SIDEBAR.TRAINING_DATA',
    [ROUTES.APP.ADMIN_FEEDBACK]: 'FEEDBACK.TITLE',
    [ROUTES.APP.ADMIN_TEMPLATES]: 'SIDEBAR.TEMPLATES',
    [ROUTES.APP.ADMIN_CONSOLE_HOME]: 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
  },
  actionItems: [
    { icon: 'open_in_new', labelKey: 'SIDEBAR.NEW_CHAT', route: '#' },
    { icon: 'search', labelKey: 'SIDEBAR.SEARCH_CHAT', route: ROUTES.APP.CHAT_SEARCH },
  ],
  // 用語辞書（SIDEBAR.GLOSSARY）・データソース（SIDEBAR.DATA_SOURCE）は移植元でコメントアウトされた非表示機能のため持たない
  sectionGroups: [
    {
      labelKey: 'SIDEBAR.DATA_UTILIZATION',
      collapsed: false,
      items: [
        {
          icon: 'library',
          iconType: 'svg',
          labelKey: 'SIDEBAR.LIBRARY',
          route: ROUTES.APP.LIBRARY,
        },
      ],
    },
    {
      labelKey: 'SIDEBAR.EXTERNAL_SERVICES',
      collapsed: false,
      items: [
        {
          icon: '/icons/ranabase-icon.svg',
          iconType: 'image',
          labelKey: 'SIDEBAR.RANABASE',
          route: ROUTES.APP.ADMIN_CONSOLE_HOME,
        },
      ],
    },
  ],
  userMenuActions: [
    { icon: 'lock', labelKey: 'USER_MENU.PASSWORD_SETTINGS', action: 'password' },
    { icon: 'data_usage', labelKey: 'USER_MENU.CHECK_CREDIT', action: 'check-credit' },
    { icon: 'compare_arrows', labelKey: 'USER_MENU.SWITCH_TO_ADMIN', action: 'switch-role' },
    {
      icon: 'logout',
      labelKey: 'USER_MENU.LOGOUT',
      iconClass: 'text-red-500',
      textClass: 'text-red-500!',
      action: 'logout',
      separator: true,
    },
  ],
};

/** 移植元 admin-sidebar.component.ts の FULL_MENU_SECTIONS（テナント管理者用） */
export const ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
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
      { icon: 'groups', labelKey: 'ADMIN_CONSOLE.TEAM_MANAGEMENT', route: ROUTES.APP.ADMIN_GROUPS },
    ],
  },
  {
    labelKey: 'ADMIN_CONSOLE.SERVICE_SETTINGS',
    items: [
      { icon: 'smart_toy', labelKey: 'SIDEBAR.ASSISTANTS', route: ROUTES.APP.ADMIN_ASSISTANTS },
      { icon: 'history', labelKey: 'SIDEBAR.CHAT_HISTORY', route: ROUTES.APP.ADMIN_CHAT_HISTORY },
      {
        icon: 'database',
        labelKey: 'SIDEBAR.TRAINING_DATA',
        route: ROUTES.APP.ADMIN_TRAINING_DATA,
      },
      { icon: 'thumbs_up_double', labelKey: 'SIDEBAR.FEEDBACK', route: ROUTES.APP.ADMIN_FEEDBACK },
      { icon: 'terminal', labelKey: 'SIDEBAR.TEMPLATES', route: ROUTES.APP.ADMIN_TEMPLATES },
    ],
  },
];

/** 移植元 admin-sidebar.component.ts の GROUP_ADMIN_MENU_SECTIONS（グループ管理者だけのユーザー用） */
export const GROUP_ADMIN_MENU_SECTIONS: AdminMenuSection[] = [
  {
    labelKey: 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
    items: [
      { icon: 'groups', labelKey: 'ADMIN_CONSOLE.TEAM_MANAGEMENT', route: ROUTES.APP.ADMIN_GROUPS },
    ],
  },
];

/** 戻るボタンだけのサイドバーにする画面（移植元 core/constants/global.config.ts） */
export const SCREEN_USE_BACK_SIDEBAR = ['/library/', '/chat-shared-history/', '/feedback-preview/'];

/** SCREEN_USE_BACK_SIDEBAR に部分一致しても通常のサイドバーにする画面 */
export const PARENT_OF_SCREEN_USE_BACK_SIDEBAR = ['/library'];

/** サイドバーのナビ項目 1 行の高さ（px）。セクション開閉のアニメーションで高さを計算する */
export const SIDEBAR_ITEM_HEIGHT_PX = 36;
