const ENCODED_COLON = /%3A/gi;

/**
 * MSW のハンドラーに渡す URL パターン。
 * ベースURL（VITE_API_URL・VITE_AUTH_API_URL）に関係なく一致させるため、先頭をワイルドカードにする。
 * パスパラメータは API_PATHS の関数に `:id` 形式で渡す（例: `mockPath(API_PATHS.ROOMS.DETAIL(':roomId'))`）。
 */
export function mockPath(path: string): string {
  // ADMIN.USERS.DETAIL などは値を encodeURIComponent するため、`:loginId` が `%3AloginId` になる。パラメータとして戻す
  return `*${path.replace(ENCODED_COLON, ':')}`;
}
