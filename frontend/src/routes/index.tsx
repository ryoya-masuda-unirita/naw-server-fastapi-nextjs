import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, Outlet, type RouteObject } from 'react-router-dom';
import { AdminLayout } from '@/components/layouts/admin-layout';
import { APP_PATHS, GROUP_DETAIL_TABS, ROUTE_SEGMENTS, ROUTES } from '@/lib/constants/routes';
import { LoginPage } from './auth/login';
import { PwResetPage } from './auth/pw-reset';
import {
  RequireAdmin,
  RequireAdminConsole,
  RequireAuth,
  RequireGroupAccess,
  RequireNoAuth,
  RequireTenantAdmin,
} from './guards';

// 移植元 app.routes.ts・features/admin/admin.routes.ts・auth.routes.ts・chat.routes.ts をまとめたもの。
// 全画面の枠を定義済み。画面を移植するときは、ここではなく各画面のファイル（下の import 先）を書き換える。
// 用語集（/glossary 配下）は移植元で非表示にした機能のため定義しない（docs/issue-277）。

/** 名前付き export の画面を遅延読み込みする（移植元の loadComponent と同じく、画面ごとにチャンクを分ける） */
function lazyNamed<K extends string, M extends Record<K, ComponentType>>(
  loader: () => Promise<M>,
  name: K
): LazyExoticComponent<ComponentType> {
  return lazy(async () => ({ default: (await loader())[name] }));
}

/** 読み込み中は何も出さない（移植元も loadComponent の読み込み中は何も表示しない） */
function page(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

const ChatNewPage = lazyNamed(() => import('./chat/chat-new'), 'ChatNewPage');
const ChatAssistantPage = lazyNamed(() => import('./chat/chat-assistant'), 'ChatAssistantPage');
const AdminChatRoomPage = lazyNamed(() => import('./chat/chat-room'), 'AdminChatRoomPage');
const ChatViewerPage = lazyNamed(() => import('./chat/chat-viewer'), 'ChatViewerPage');
const ChatSharedPage = lazyNamed(() => import('./chat/chat-shared'), 'ChatSharedPage');
const ChatSharedHistoryPage = lazyNamed(
  () => import('./chat-shared-history/chat-shared-history'),
  'ChatSharedHistoryPage'
);
const FeedbackPreviewPage = lazyNamed(
  () => import('./feedback-preview/feedback-preview'),
  'FeedbackPreviewPage'
);
const AdminLibraryPage = lazyNamed(() => import('./library/library-list'), 'AdminLibraryPage');
const LibraryDetailPage = lazyNamed(() => import('./library/library-detail'), 'LibraryDetailPage');
const UsersPage = lazyNamed(() => import('./users/users'), 'UsersPage');
const UserFormPage = lazyNamed(() => import('./users/user-form'), 'UserFormPage');
const UserDetailPage = lazyNamed(() => import('./users/user-detail'), 'UserDetailPage');
const ReportsPage = lazyNamed(() => import('./reports/reports'), 'ReportsPage');
const AdminSettingsPage = lazyNamed(() => import('./settings/settings'), 'AdminSettingsPage');
const AdminUserListPage = lazyNamed(() => import('./admin/users/user-list'), 'AdminUserListPage');
const GroupListPage = lazyNamed(() => import('./admin/groups/group-list'), 'GroupListPage');
const GroupDetailPage = lazyNamed(() => import('./admin/groups/group-detail'), 'GroupDetailPage');
const GroupDetailUsersPage = lazyNamed(
  () => import('./admin/groups/group-detail-users'),
  'GroupDetailUsersPage'
);
const GroupDetailTemplatesPage = lazyNamed(
  () => import('./admin/groups/group-detail-templates'),
  'GroupDetailTemplatesPage'
);
const GroupDetailAssistantsPage = lazyNamed(
  () => import('./admin/groups/group-detail-assistants'),
  'GroupDetailAssistantsPage'
);
const GroupMembersPage = lazyNamed(
  () => import('./admin/groups/group-members'),
  'GroupMembersPage'
);
const TenantPage = lazyNamed(() => import('./admin/tenant/tenant'), 'TenantPage');
const ChatHistoryPage = lazyNamed(
  () => import('./admin/chat-history/chat-history'),
  'ChatHistoryPage'
);
const AdminChatHistoryDetailPage = lazyNamed(
  () => import('./admin/chat-history/chat-history-detail'),
  'AdminChatHistoryDetailPage'
);
const AdminAssistantListPage = lazyNamed(
  () => import('./admin/assistants/assistant-list'),
  'AdminAssistantListPage'
);
const AdminTemplateListPage = lazyNamed(
  () => import('./admin/templates/template-list'),
  'AdminTemplateListPage'
);
const AdminFeedbackListPage = lazyNamed(
  () => import('./admin/feedback/feedback-list'),
  'AdminFeedbackListPage'
);
const TrainingDataPage = lazyNamed(
  () => import('./admin/training-data/training-data'),
  'TrainingDataPage'
);
const TrainingDataDetailPage = lazyNamed(
  () => import('./admin/training-data/training-data-detail'),
  'TrainingDataDetailPage'
);

const tenantAdminPage = (Component: LazyExoticComponent<ComponentType>) => (
  <RequireTenantAdmin>{page(Component)}</RequireTenantAdmin>
);

const adminPage = (Component: LazyExoticComponent<ComponentType>) => (
  <RequireAdmin>{page(Component)}</RequireAdmin>
);

export const routes: RouteObject[] = [
  // ============ 認証（移植元 auth.routes.ts） ============
  {
    path: ROUTES.AUTH.LOGIN,
    element: (
      <RequireNoAuth>
        <LoginPage />
      </RequireNoAuth>
    ),
  },
  { path: ROUTES.AUTH.PW_RESET, element: <PwResetPage /> },
  { path: ROUTES.AUTH.ROOT, element: <Navigate to={ROUTES.AUTH.LOGIN} replace /> },

  // ============ レイアウトなしのチャット（移植元 chat.routes.ts） ============
  {
    path: `/${ROUTE_SEGMENTS.CHAT}`,
    element: (
      <RequireAuth>
        <Outlet />
      </RequireAuth>
    ),
    children: [
      { path: APP_PATHS.CHAT_VIEWER, element: page(ChatViewerPage) },
      { path: APP_PATHS.CHAT_SHARE, element: page(ChatSharedPage) },
      // 移植元は '/admin/chat/new' へリダイレクトするが、一致するルートがなく ADMIN_ROUTES の '**' で /dashboard になる
      { index: true, element: <Navigate to={ROUTES.APP.DASHBOARD} replace /> },
    ],
  },

  // ============ 管理レイアウト配下（移植元 app.routes.ts の '' + admin.routes.ts） ============
  {
    path: ROUTES.APP.ROOT,
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to={ROUTES.APP.DASHBOARD} replace /> },
      // 移植元はダッシュボードで新規チャット画面を表示する
      { path: APP_PATHS.DASHBOARD, element: page(ChatNewPage) },

      // 旧ユーザー管理・レポート・設定（adminGuard）
      { path: APP_PATHS.USERS, element: adminPage(UsersPage) },
      { path: APP_PATHS.USERS_NEW, element: adminPage(UserFormPage) },
      { path: APP_PATHS.USERS_DETAIL, element: adminPage(UserDetailPage) },
      { path: APP_PATHS.USERS_EDIT, element: adminPage(UserFormPage) },
      { path: APP_PATHS.REPORTS, element: adminPage(ReportsPage) },
      { path: APP_PATHS.SETTINGS, element: adminPage(AdminSettingsPage) },

      // 管理コンソール（adminConsoleGuard）
      {
        path: ROUTE_SEGMENTS.ADMIN,
        element: (
          <RequireAdminConsole>
            <Outlet />
          </RequireAdminConsole>
        ),
        children: [
          { path: APP_PATHS.ADMIN_USERS, element: tenantAdminPage(AdminUserListPage) },
          { path: APP_PATHS.ADMIN_GROUPS, element: page(GroupListPage) },
          {
            path: APP_PATHS.ADMIN_GROUP_DETAIL,
            element: <RequireGroupAccess>{page(GroupDetailPage)}</RequireGroupAccess>,
            children: [
              { index: true, element: <Navigate to={GROUP_DETAIL_TABS.USERS} replace /> },
              { path: GROUP_DETAIL_TABS.USERS, element: page(GroupDetailUsersPage) },
              { path: GROUP_DETAIL_TABS.TEMPLATES, element: page(GroupDetailTemplatesPage) },
              { path: GROUP_DETAIL_TABS.ASSISTANTS, element: page(GroupDetailAssistantsPage) },
            ],
          },
          // 移植元でも旧画面として残しているルート
          {
            path: APP_PATHS.ADMIN_GROUP_MEMBERS,
            element: <RequireGroupAccess>{page(GroupMembersPage)}</RequireGroupAccess>,
          },
          { path: APP_PATHS.ADMIN_TENANT, element: tenantAdminPage(TenantPage) },
          { path: APP_PATHS.ADMIN_CHAT_HISTORY, element: tenantAdminPage(ChatHistoryPage) },
          {
            path: APP_PATHS.ADMIN_CHAT_HISTORY_DETAIL,
            element: tenantAdminPage(AdminChatHistoryDetailPage),
          },
          { path: APP_PATHS.ADMIN_ASSISTANTS, element: tenantAdminPage(AdminAssistantListPage) },
          { path: APP_PATHS.ADMIN_TEMPLATES, element: tenantAdminPage(AdminTemplateListPage) },
          { path: APP_PATHS.ADMIN_FEEDBACK, element: tenantAdminPage(AdminFeedbackListPage) },
          { path: APP_PATHS.ADMIN_TRAINING_DATA, element: tenantAdminPage(TrainingDataPage) },
          {
            path: APP_PATHS.ADMIN_TRAINING_DATA_DETAIL,
            element: tenantAdminPage(TrainingDataDetailPage),
          },
        ],
      },

      { path: APP_PATHS.LIBRARY, element: page(AdminLibraryPage) },
      { path: APP_PATHS.LIBRARY_DETAIL, element: page(LibraryDetailPage) },
      { path: APP_PATHS.CHAT_NEW, element: page(ChatNewPage) },
      { path: APP_PATHS.CHAT_ASSISTANT, element: page(ChatAssistantPage) },
      { path: APP_PATHS.CHAT_ROOM, element: page(AdminChatRoomPage) },
      { path: APP_PATHS.CHAT_SHARED_HISTORY, element: page(ChatSharedHistoryPage) },
      { path: APP_PATHS.FEEDBACK_PREVIEW, element: page(FeedbackPreviewPage) },

      // 移植元 ADMIN_ROUTES の '**'。未ログインなら RequireAuth でログイン画面になる
      { path: '*', element: <Navigate to={ROUTES.APP.DASHBOARD} replace /> },
    ],
  },
];
