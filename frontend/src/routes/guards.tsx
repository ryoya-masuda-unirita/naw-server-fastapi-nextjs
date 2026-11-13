import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ROUTES } from '@/lib/constants/routes';
import { useAuthStore } from '@/store/auth-store';

// 移植元 core/guards/*.ts。条件と遷移先は移植元と同じにする。
// 移植元のガードは ensureInitialized() を待つが、React 版は main.tsx でセッション確認を待ってから描画するため同期的に読めばよい。

interface GuardProps {
  children: ReactNode;
}

/** authGuard: ログイン済みだけ通す */
export function RequireAuth({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }
  return <>{children}</>;
}

/** noAuthGuard: 未ログインだけ通す（ログイン画面用） */
export function RequireNoAuth({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (isAuthenticated) {
    return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  }
  return <>{children}</>;
}

/**
 * adminGuard: テナント管理者だけ通す。
 * 移植元はログイン済みの非管理者に false を返して遷移を取り消す（直接 URL を開くと何も表示されない）。
 * React Router に取り消しはないため、何も描画しない形で揃える
 */
export function RequireAdmin({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }
  if (!isAdmin) {
    return null;
  }
  return <>{children}</>;
}

/** adminConsoleGuard: 管理コンソール（/admin 配下）に入れるユーザー（テナント管理者・グループ管理者）だけ通す */
export function RequireAdminConsole({ children }: GuardProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const canAccessAdminConsole = useAuthStore((state) => state.canAccessAdminConsole);
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }
  if (!canAccessAdminConsole) {
    return <Navigate to={ROUTES.APP.CHAT_NEW} replace />;
  }
  return <>{children}</>;
}

/** tenantAdminGuard: テナント管理者だけ通す。グループ管理者はグループ一覧へ、それ以外は新規チャットへ */
export function RequireTenantAdmin({ children }: GuardProps) {
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const isGroupAdmin = useAuthStore((state) => state.isGroupAdmin);
  if (isAdmin) {
    return <>{children}</>;
  }
  if (isGroupAdmin) {
    return <Navigate to={ROUTES.APP.ADMIN_GROUPS} replace />;
  }
  return <Navigate to={ROUTES.APP.CHAT_NEW} replace />;
}

/** groupAccessGuard: テナント管理者と、URL の :id のグループの管理者だけ通す。それ以外はグループ一覧へ */
export function RequireGroupAccess({ children }: GuardProps) {
  const { id: groupId } = useParams();
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const adminGroupIds = useAuthStore((state) => state.adminGroupIds);
  if (isAdmin) {
    return <>{children}</>;
  }
  if (groupId && adminGroupIds.includes(groupId)) {
    return <>{children}</>;
  }
  return <Navigate to={ROUTES.APP.ADMIN_GROUPS} replace />;
}
