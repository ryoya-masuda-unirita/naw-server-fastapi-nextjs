import { STORAGE_KEYS } from '../constants';
import { GroupDTO, User } from '@features/auth/types';

export function isUserAdmin(): boolean {
  const user = getUserFromStorage();
  return user?.role === 'ADMIN';
}

export function isUserGroupAdmin(user: User | null = getUserFromStorage()): boolean {
  return user?.groups?.some((group) => group.groupAdmin) ?? false;
}

export function getAdminGroupIds(user: User | null = getUserFromStorage()): string[] {
  return (user?.groups ?? []).filter((group) => group.groupAdmin).map((group) => group.groupId);
}

export function canAccessAdminConsole(user: User | null = getUserFromStorage()): boolean {
  return isUserAdmin() || isUserGroupAdmin(user);
}

export function isGroupAdminOnly(user: User | null = getUserFromStorage()): boolean {
  return user?.role === 'USER' && isUserGroupAdmin(user);
}

type UserIdentityRow = {
  id: string;
  userId?: string;
  name?: string;
  displayName?: string;
  loginKey?: string;
};

type CurrentUserIdentity = {
  id: string;
  name: string;
};

function collectIdentityKeys(...values: (string | null | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => !!value && value.trim().length > 0));
}

export function matchesCurrentUser(
  row: UserIdentityRow,
  currentUser: CurrentUserIdentity | null | undefined,
): boolean {
  if (!currentUser) return false;

  const currentKeys = collectIdentityKeys(currentUser.id, currentUser.name);
  const rowKeys = collectIdentityKeys(row.id, row.userId, row.name, row.displayName, row.loginKey);

  for (const key of rowKeys) {
    if (currentKeys.has(key)) {
      return true;
    }
  }

  return false;
}

export function getUserFromStorage(): User | null {
  try {
    const userDataStr = sessionStorage.getItem(STORAGE_KEYS.USER);
    if (!userDataStr) return null;
    return JSON.parse(userDataStr) as User;
  } catch {
    return null;
  }
}

export function getUserRole(): string | null {
  const user = getUserFromStorage();
  return user?.role ?? null;
}
