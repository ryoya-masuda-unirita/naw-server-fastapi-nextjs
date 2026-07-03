import type { UserApiItem } from '@app-types/admin/user.types';

/** Resolves a user row label from API fields (`displayName`, `name`, `email`). */
export function userDisplayName(user: UserApiItem): string {
  return user.displayName?.trim() || user.name?.trim() || user.email?.trim() || user.id;
}

/** Maps `users.id` and `users.userId` to a display label for token-usage rows. */
export function buildUserDisplayNameMap(users: UserApiItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const user of users) {
    const label = userDisplayName(user);
    map.set(user.id, label);
    if (user.userId) {
      map.set(user.userId, label);
    }
  }
  return map;
}

/** Normalizes list API users so `displayName` is always populated for UI. */
export function normalizeUserApiItem(user: UserApiItem): UserApiItem {
  return {
    ...user,
    displayName: userDisplayName(user),
  };
}
