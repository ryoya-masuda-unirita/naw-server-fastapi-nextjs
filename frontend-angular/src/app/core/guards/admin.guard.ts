import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const adminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.ensureInitialized();

  if (!authStore.isAuthenticated()) {
    return router.createUrlTree([ROUTES.AUTH.LOGIN]);
  }

  if (authStore.isAdmin()) {
    return true;
  }

  return false;
};
