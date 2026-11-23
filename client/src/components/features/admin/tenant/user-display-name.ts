import type { UserApiItem } from '@/types/admin/user.types';

// 移植元 tenant/utils/user-display-name.util.ts

/** API の項目（`displayName`・`name`・`email`）から利用者の表示名を決める */
export function userDisplayName(user: UserApiItem): string {
  return user.displayName?.trim() || user.name?.trim() || user.email?.trim() || user.id;
}

/** 一覧 API のユーザーの `displayName` を必ず埋める */
export function normalizeUserApiItem(user: UserApiItem): UserApiItem {
  return {
    ...user,
    displayName: userDisplayName(user),
  };
}
