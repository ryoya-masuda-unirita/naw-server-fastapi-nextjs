import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { AuthStore } from '@core/stores/auth.store';

/** Glossary management UI (tabs, CRUD) — admin only. */
export const glossaryAdminRouteMatch: CanMatchFn = () => {
  const auth = inject(AuthStore);
  auth.ensureInitialized();
  return auth.isAuthenticated() && auth.isAdmin();
};

/** Glossary browse UI (cards, read-only detail) — authenticated non-admin users. */
export const glossaryUserRouteMatch: CanMatchFn = () => {
  const auth = inject(AuthStore);
  auth.ensureInitialized();
  return auth.isAuthenticated() && !auth.isAdmin();
};
