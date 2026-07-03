import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { ROUTES } from '@core/constants/routes.config';
import { AuthStore } from '../stores/auth.store';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean | UrlTree => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  const allowedRoles = route.data['roles'] as string[];
  const userRole = authStore.user()?.role;

  if (userRole && allowedRoles.includes(userRole)) {
    return true;
  }

  // Redirect to appropriate dashboard
  if (userRole === 'ADMIN') {
    return router.createUrlTree([ROUTES.APP.DASHBOARD]);
  }

  return false;
};
