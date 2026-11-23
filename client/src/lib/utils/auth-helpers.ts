// 移植元 core/utils/auth.helpers.ts の matchesCurrentUser。
// 権限まわりの関数（isGroupAdminOnly など）は auth-store の派生値として移植済みのため、ここには持たない。

/** 一覧の行からログインユーザーかどうかを判断するための項目（移植元 UserIdentityRow） */
interface UserIdentityRow {
  id: string;
  userId?: string;
  name?: string;
  displayName?: string;
  loginKey?: string;
}

/** ログインユーザーの識別に使う項目 */
interface CurrentUserIdentity {
  id: string;
  name: string;
}

/** 空白だけの値は識別に使えないので捨てる */
function collectIdentityKeys(...values: (string | null | undefined)[]): Set<string> {
  return new Set(values.filter((value): value is string => !!value && value.trim().length > 0));
}

/**
 * 一覧の行がログインユーザー自身か。
 * ID・ログインID・名前・表示名のどれか 1 つでも、ログインユーザーの ID・名前と一致すれば自分とみなす。
 *
 * @param row 一覧の 1 行
 * @param currentUser ログインユーザー（未ログインなら null）
 */
export function matchesCurrentUser(
  row: UserIdentityRow,
  currentUser: CurrentUserIdentity | null | undefined,
): boolean {
  if (!currentUser) return false;

  const currentKeys = collectIdentityKeys(currentUser.id, currentUser.name);
  const rowKeys = collectIdentityKeys(row.id, row.userId, row.name, row.displayName, row.loginKey);

  for (const key of rowKeys) {
    if (currentKeys.has(key)) return true;
  }
  return false;
}
