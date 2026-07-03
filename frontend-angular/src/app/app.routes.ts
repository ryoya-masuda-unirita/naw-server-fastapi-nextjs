import { Routes } from '@angular/router';
import { AUTH_PATHS, ROUTE_SEGMENTS } from '@core/constants/routes.config';
import { authGuard, noAuthGuard } from '@core/guards';

export const routes: Routes = [
  // ============ Public Routes (Auth) ============
  {
    path: ROUTE_SEGMENTS.AUTH,
    loadComponent: () =>
      import('@layouts/auth-layout/auth-layout.component').then((m) => m.AuthLayoutComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('@features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
      },
    ],
  },

  // ============ Shared Chat Routes (For both Admin & User) ============
  {
    path: ROUTE_SEGMENTS.CHAT,
    loadChildren: () => import('@features/chat/chat.routes').then((m) => m.CHAT_ROUTES),
    canActivate: [authGuard],
  },

  // ============ Admin Routes (Protected) ============
  {
    path: '',
    loadComponent: () =>
      import('@layouts/admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadChildren: () => import('@features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },

  // ============ Default & Fallback ============
  {
    path: '',
    redirectTo: `${ROUTE_SEGMENTS.AUTH}/${AUTH_PATHS.LOGIN}`,
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: `${ROUTE_SEGMENTS.AUTH}/${AUTH_PATHS.LOGIN}`,
  },
];
