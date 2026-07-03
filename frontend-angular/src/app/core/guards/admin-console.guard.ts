import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const adminConsoleGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.ensureInitialized();

  if (!authStore.isAuthenticated()) {
    return router.createUrlTree([ROUTES.AUTH.LOGIN]);
  }

  if (authStore.canAccessAdminConsole()) {
    return true;
  }

  return router.createUrlTree([ROUTES.APP.CHAT_NEW]);
};
