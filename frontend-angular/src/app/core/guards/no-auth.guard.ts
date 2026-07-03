import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const noAuthGuard: CanActivateFn = (): boolean | UrlTree => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (!authStore.isAuthenticated()) return true;

  return router.createUrlTree([ROUTES.APP.DASHBOARD]);
};
