import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const groupAccessGuard: CanActivateFn = (
  route: ActivatedRouteSnapshot,
): boolean | UrlTree => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  if (authStore.isAdmin()) {
    return true;
  }

  const groupId = route.paramMap.get('id');
  if (!groupId) {
    return router.createUrlTree([ROUTES.APP.ADMIN_GROUPS]);
  }

  if (authStore.adminGroupIds().includes(groupId)) {
    return true;
  }

  return router.createUrlTree([ROUTES.APP.ADMIN_GROUPS]);
};
