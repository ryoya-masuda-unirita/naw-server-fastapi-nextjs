import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const tenantAdminGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.ensureInitialized();

  if (authStore.isAdmin()) {
    return true;
  }

  if (authStore.isGroupAdmin()) {
    return router.createUrlTree([ROUTES.APP.ADMIN_GROUPS]);
  }

  return router.createUrlTree([ROUTES.APP.CHAT_NEW]);
};
