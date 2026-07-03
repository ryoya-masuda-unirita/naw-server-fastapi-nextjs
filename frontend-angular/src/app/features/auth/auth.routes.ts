import { Routes } from '@angular/router';
import { noAuthGuard } from '@core/guards';
import { AUTH_PATHS } from '@core/constants/routes.config';

export const AUTH_ROUTES: Routes = [
  {
    path: AUTH_PATHS.LOGIN,
    canActivate: [noAuthGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: AUTH_PATHS.PW_RESET,
    loadComponent: () =>
      import('./pages/pw-reset/pw-reset.component').then((m) => m.PwResetComponent),
  },
  {
    path: '',
    redirectTo: AUTH_PATHS.LOGIN,
    pathMatch: 'full',
  },
];
