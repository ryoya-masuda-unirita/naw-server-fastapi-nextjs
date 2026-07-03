import { ROUTES } from '@core/constants/routes.config';
import { LayoutConfig } from '@app-types/layout.type';

export const ADMIN_LAYOUT_CONFIG: LayoutConfig = {
  role: 'admin',
  dashboardRoute: ROUTES.APP.DASHBOARD,
  chatNewRoute: ROUTES.APP.CHAT_NEW,
  chatSearchRoute: ROUTES.APP.CHAT_SEARCH,
  chatRoomRoute: ROUTES.APP.CHAT_ROOM,
  libraryRoute: ROUTES.APP.LIBRARY,
  adminRoute: ROUTES.APP.ADMIN_CONSOLE_HOME,
  adminTenantRoute: ROUTES.APP.ADMIN_TENANT,
  externalSiteUrl: 'https://ranabase.com',
  adminTitleMap: {
    '/admin/users': 'ADMIN_CONSOLE.USER_MANAGEMENT',
    '/admin/groups': 'ADMIN_CONSOLE.TEAM_MANAGEMENT',
    '/admin/tenant': 'ADMIN_CONSOLE.WORKSPACE_SETTINGS',
    '/admin/assistants': 'SIDEBAR.ASSISTANTS',
    '/admin/chat-history': 'SIDEBAR.CHAT_HISTORY',
    '/admin/training-data': 'SIDEBAR.TRAINING_DATA',
    '/admin/feedback': 'FEEDBACK.TITLE',
    '/admin/templates': 'SIDEBAR.TEMPLATES',
    '/admin/management': 'ADMIN_CONSOLE.MANAGEMENT_CONSOLE',
  },
  actionItems: [
    {
      icon: 'open_in_new',
      iconType: 'svg',
      labelKey: 'SIDEBAR.NEW_CHAT',
      route: '#',
    },
    {
      icon: 'search',
      iconType: 'svg',
      labelKey: 'SIDEBAR.SEARCH_CHAT',
      route: ROUTES.APP.CHAT_SEARCH,
    },
  ],
  sectionGroups: [
    {
      labelKey: 'SIDEBAR.DATA_UTILIZATION',
      collapsed: false,
      items: [
        // TODO: 用語辞書 — 将来実装予定
        // {
        //   icon: 'glossary',
        //   iconType: 'svg',
        //   labelKey: 'SIDEBAR.GLOSSARY',
        //   route: ROUTES.APP.GLOSSARY,
        // },
        {
          icon: 'library',
          iconType: 'svg',
          labelKey: 'SIDEBAR.LIBRARY',
          route: ROUTES.APP.LIBRARY,
        },
        // TODO: データソース — 将来実装予定
        // {
        //   icon: 'data_source',
        //   iconType: 'svg',
        //   labelKey: 'SIDEBAR.DATA_SOURCE',
        //   route: ROUTES.APP.DATA_SOURCE,
        // },
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
    {
      icon: 'lock',
      labelKey: 'USER_MENU.PASSWORD_SETTINGS',
      action: 'password',
    },
    {
      icon: 'data_usage',
      labelKey: 'USER_MENU.CHECK_CREDIT',
      trailingIcon: 'error',
      trailingIconClass: 'text-text-weak!',
      action: 'check-credit',
    },
    {
      icon: 'compare_arrows',
      labelKey: 'USER_MENU.SWITCH_TO_ADMIN',
      action: 'switch-role',
    },
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

/** User portal layout — same shell as admin without management-console entry. */
export const USER_LAYOUT_CONFIG: LayoutConfig = {
  role: 'user',
  dashboardRoute: ROUTES.APP.DASHBOARD,
  chatNewRoute: ROUTES.APP.CHAT_NEW,
  chatSearchRoute: ROUTES.APP.CHAT_SEARCH,
  chatRoomRoute: ROUTES.APP.CHAT_ROOM,
  libraryRoute: ROUTES.APP.LIBRARY,
  adminRoute: ROUTES.APP.ADMIN_CONSOLE_HOME,
  adminTenantRoute: ROUTES.APP.ADMIN_TENANT,
  externalSiteUrl: 'https://ranabase.com',
  adminTitleMap: {},
  actionItems: [
    {
      icon: 'open_in_new',
      iconType: 'svg',
      labelKey: 'SIDEBAR.NEW_CHAT',
      route: '#',
    },
    {
      icon: 'search',
      iconType: 'svg',
      labelKey: 'SIDEBAR.SEARCH_CHAT',
      route: ROUTES.APP.CHAT_SEARCH,
    },
  ],
  sectionGroups: [
    {
      labelKey: 'SIDEBAR.DATA_UTILIZATION',
      collapsed: false,
      items: [
        // TODO: 用語辞書 — 将来実装予定
        // {
        //   icon: 'glossary',
        //   iconType: 'svg',
        //   labelKey: 'SIDEBAR.GLOSSARY',
        //   route: ROUTES.APP.GLOSSARY,
        // },
        {
          icon: 'library',
          iconType: 'svg',
          labelKey: 'SIDEBAR.LIBRARY',
          route: ROUTES.APP.LIBRARY,
        },
        // TODO: データソース — 将来実装予定
        // {
        //   icon: 'data_source',
        //   iconType: 'svg',
        //   labelKey: 'SIDEBAR.DATA_SOURCE',
        //   route: ROUTES.APP.DATA_SOURCE,
        // },
      ],
    },
  ],
  userMenuActions: [
    {
      icon: 'lock',
      labelKey: 'USER_MENU.PASSWORD_SETTINGS',
      action: 'password',
    },
    {
      icon: 'data_usage',
      labelKey: 'USER_MENU.CHECK_CREDIT',
      trailingIcon: 'error',
      trailingIconClass: 'text-text-weak!',
      action: 'check-credit',
    },
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
