import type { UserApiItem } from '@/types/admin/user.types';

// 移植元 tenant/utils/user-display-name.util.ts

/** API の項目（`displayName`・`name`・`email`）から利用者の表示名を決める */
export function userDisplayName(user: UserApiItem): string {
  return user.displayName?.trim() || user.name?.trim() || user.email?.trim() || user.id;
}

/** `users.id` と `users.userId` の両方から表示名を引ける対応表（利用履歴の行の利用者名用） */
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

/** 一覧 API のユーザーの `displayName` を必ず埋める */
export function normalizeUserApiItem(user: UserApiItem): UserApiItem {
  return {
    ...user,
    displayName: userDisplayName(user),
  };
}
