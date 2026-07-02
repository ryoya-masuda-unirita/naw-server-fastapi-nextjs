/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth-store';
import { ROUTES } from '@/lib/constants/routes';
import { LoginPage } from './auth/login';
import { PwResetPage } from './auth/pw-reset';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.AUTH.LOGIN} replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to={ROUTES.APP.DASHBOARD} replace />;
  }

  return <>{children}</>;
}

export const routes = [
  {
    path: ROUTES.AUTH.LOGIN,
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: ROUTES.AUTH.PW_RESET,
    element: <PwResetPage />,
  },
  {
    path: ROUTES.AUTH.ROOT,
    element: <Navigate to={ROUTES.AUTH.LOGIN} replace />,
  },
  {
    path: '/',
    element: <Navigate to={ROUTES.AUTH.LOGIN} replace />,
  },
];
