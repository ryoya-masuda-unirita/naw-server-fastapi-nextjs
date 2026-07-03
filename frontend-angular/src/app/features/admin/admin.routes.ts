import { Routes } from '@angular/router';
import { APP_PATHS, ROUTE_SEGMENTS } from '@core/constants/routes.config';
import {
  adminConsoleGuard,
  adminGuard,
  glossaryAdminRouteMatch,
  glossaryUserRouteMatch,
  groupAccessGuard,
  tenantAdminGuard,
} from '@core/guards';

export const ADMIN_ROUTES: Routes = [
  {
    path: APP_PATHS.GLOSSARY_DICTIONARY,
    canMatch: [glossaryAdminRouteMatch],
    loadComponent: () =>
      import('./glossary/glossary-dictionary-shell/glossary-dictionary-shell.component').then(
        (m) => m.GlossaryDictionaryShellComponent,
      ),
    children: [
      {
        path: 'term-words',
        loadComponent: () =>
          import('./glossary/term-word-admin/term-word-admin.component').then(
            (m) => m.TermWordAdminComponent,
          ),
        title: 'Glossary terms',
      },
      {
        path: 'assistants',
        loadComponent: () =>
          import('./glossary/term-word-assistant-admin/term-word-assistant-admin.component').then(
            (m) => m.TermWordAssistantAdminComponent,
          ),
        title: 'Glossary assistants',
      },
      { path: '', pathMatch: 'full', redirectTo: 'term-words' },
    ],
  },
  {
    path: APP_PATHS.GLOSSARY_DICTIONARY,
    canMatch: [glossaryUserRouteMatch],
    loadComponent: () =>
      import('../users/glossary/glossary-user-dictionary-shell.component').then(
        (m) => m.GlossaryUserDictionaryShellComponent,
      ),
    children: [
      {
        path: 'term-words',
        loadComponent: () =>
          import('../users/glossary/glossary-user-term-words.component').then(
            (m) => m.GlossaryUserTermWordsComponent,
          ),
        title: 'Glossary terms',
      },
      {
        path: 'assistants',
        loadComponent: () =>
          import('../users/glossary/glossary-user-assistants.component').then(
            (m) => m.GlossaryUserAssistantsComponent,
          ),
        title: 'Glossary assistants',
      },
      { path: '', pathMatch: 'full', redirectTo: 'term-words' },
    ],
  },
  {
    path: APP_PATHS.DASHBOARD,
    loadComponent: () =>
      import('@features/chat/pages/chat-new/chat-new.component').then((m) => m.ChatNewComponent),
    title: 'Admin Dashboard',
  },
  {
    path: APP_PATHS.USERS,
    canActivate: [adminGuard],
    loadComponent: () => import('../users/users.component').then((m) => m.UsersComponent),
    title: 'User Management',
  },
  {
    path: APP_PATHS.USERS_NEW,
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./users/user-form/user-form.component').then((m) => m.UserFormComponent),
    title: 'Add User',
  },
  {
    path: APP_PATHS.USERS_DETAIL,
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./users/user-detail/user-detail.component').then((m) => m.UserDetailComponent),
    title: 'User Details',
  },
  {
    path: APP_PATHS.USERS_EDIT,
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./users/user-form/user-form.component').then((m) => m.UserFormComponent),
    title: 'Edit User',
  },
  {
    path: APP_PATHS.REPORTS,
    canActivate: [adminGuard],
    loadComponent: () => import('./reports/reports.component').then((m) => m.ReportsComponent),
    title: 'Reports',
  },
  {
    path: APP_PATHS.SETTINGS,
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./settings/settings.component').then((m) => m.AdminSettingsComponent),
    title: 'Settings',
  },
  // ============ Admin Management Routes ============
  {
    path: ROUTE_SEGMENTS.ADMIN,
    canActivate: [adminConsoleGuard],
    children: [
      {
        path: APP_PATHS.ADMIN_USERS,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/user-list/user-list.component').then(
            (m) => m.AdminUserListComponent,
          ),
        title: 'Admin Users',
      },
      {
        path: APP_PATHS.ADMIN_GROUPS,
        loadComponent: () =>
          import('./management/group-list/group-list.component').then((m) => m.GroupListComponent),
        title: 'Group Management',
      },
      {
        path: `${APP_PATHS.ADMIN_GROUPS}/:id`,
        canActivate: [groupAccessGuard],
        loadComponent: () =>
          import('./management/group-list/group-detail/group-detail.component').then(
            (m) => m.GroupDetailComponent,
          ),
        title: 'Group Detail',
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'users' },
          {
            path: 'users',
            loadComponent: () =>
              import('./management/group-list/group-detail/users/group-detail-users.component').then(
                (m) => m.GroupDetailUsersComponent,
              ),
            title: 'Group Users',
          },
          {
            path: 'templates',
            loadComponent: () =>
              import('./management/group-list/group-detail/templates/group-detail-templates.component').then(
                (m) => m.GroupDetailTemplatesComponent,
              ),
            title: 'Group Templates',
          },
          {
            path: 'assistants',
            loadComponent: () =>
              import('./management/group-list/group-detail/assistants/group-detail-assistants.component').then(
                (m) => m.GroupDetailAssistantsComponent,
              ),
            title: 'Group Assistants',
          },
        ],
      },
      // Legacy nested route — kept for any old navigation paths.
      {
        path: `${APP_PATHS.ADMIN_GROUPS}/:id/members`,
        canActivate: [groupAccessGuard],
        loadComponent: () =>
          import('./management/group-list/group-members/group-members.component').then(
            (m) => m.GroupMembersComponent,
          ),
        title: 'Group Members',
      },
      {
        path: APP_PATHS.ADMIN_TENANT,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/tenant/tenant.component').then((m) => m.TenantComponent),
        title: 'Admin Tenant',
      },
      {
        path: APP_PATHS.ADMIN_CHAT_HISTORY,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/chat-history/chat-history.component').then(
            (m) => m.ChatHistoryPageComponent,
          ),
        title: 'Chat History',
      },
      {
        path: APP_PATHS.ADMIN_CHAT_HISTORY_DETAIL,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/chat-history/chat-history-detail/chat-history-detail.component').then(
            (m) => m.AdminChatHistoryDetailComponent,
          ),
        title: 'Chat History Detail',
      },
      {
        path: APP_PATHS.ADMIN_ASSISTANTS,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/assistant-list/assistant-list.component').then(
            (m) => m.AdminAssistantListComponent,
          ),
        title: 'Admin Assistants',
      },
      {
        path: APP_PATHS.ADMIN_TEMPLATES,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/template-list/template-list.component').then(
            (m) => m.AdminTemplateListComponent,
          ),
        title: 'Admin Templates',
      },
      {
        path: APP_PATHS.ADMIN_FEEDBACK,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/feedback-list/feedback-list.component').then(
            (m) => m.AdminFeedbackListComponent,
          ),
        title: 'Admin Feedback',
      },
      {
        path: APP_PATHS.ADMIN_TRAINING_DATA,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/training-data/training-data.component').then(
            (m) => m.TrainingDataComponent,
          ),
        title: 'Training Data Management',
      },
      {
        path: APP_PATHS.ADMIN_TRAINING_DATA_DETAIL,
        canActivate: [tenantAdminGuard],
        loadComponent: () =>
          import('./management/training-data/training-data-detail/training-data-detail.component').then(
            (m) => m.TrainingDataDetailComponent,
          ),
        title: 'Training Data Detail',
      },
    ],
  },
  {
    path: APP_PATHS.LIBRARY,
    loadComponent: () =>
      import('./library/library-list/library-list.component').then((m) => m.AdminLibraryComponent),
    title: 'Admin Library',
  },
  {
    path: APP_PATHS.LIBRARY_DETAIL,
    loadComponent: () =>
      import('./library/library-detail/library-detail.component').then(
        (m) => m.LibraryDetailComponent,
      ),
    title: 'Library Detail',
  },
  {
    path: APP_PATHS.GLOSSARY,
    canMatch: [glossaryAdminRouteMatch],
    loadComponent: () =>
      import('./glossary/glossary.component').then((m) => m.AdminGlossaryComponent),
    title: 'Admin Glossary',
  },
  {
    path: APP_PATHS.GLOSSARY,
    canMatch: [glossaryUserRouteMatch],
    loadComponent: () =>
      import('../users/glossary/glossary-user-list.component').then(
        (m) => m.GlossaryUserListComponent,
      ),
    title: 'Glossary',
  },
  {
    path: APP_PATHS.CHAT_NEW,
    loadComponent: () =>
      import('@features/chat/pages/chat-new/chat-new.component').then((m) => m.ChatNewComponent),
  },
  {
    path: APP_PATHS.CHAT_ASSISTANT,
    loadComponent: () =>
      import('./chat-assistant/chat-assistant.component').then((m) => m.ChatAssistantComponent),
  },
  {
    path: APP_PATHS.CHAT_ROOM,
    loadComponent: () =>
      import('./chat-room/chat-room.component').then((m) => m.AdminChatRoomComponent),
    title: 'Chat Room',
  },
  {
    path: APP_PATHS.CHAT_SHARED_HISTORY,
    loadComponent: () =>
      import('./chat-shared-history/chat-shared-history.component').then(
        (m) => m.ChatSharedHistoryComponent,
      ),
    title: 'Shared Chat',
  },
  {
    path: APP_PATHS.FEEDBACK_PREVIEW,
    loadComponent: () =>
      import('./feedback-preview/feedback-preview.component').then(
        (m) => m.FeedbackPreviewComponent,
      ),
    title: 'Feedback Preview',
  },
  {
    path: '**',
    redirectTo: APP_PATHS.DASHBOARD,
  },
];
