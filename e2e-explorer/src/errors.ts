/** 例外の扱いの共通処理。 */

/** 例外を 1 行のメッセージにする（Playwright の例外は呼び出し履歴などを複数行で持つため）。 */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message.split('\n')[0] : String(e);
}

/**
 * 後片付け（タブ・コンテキストを閉じるなど）の失敗を、握り潰さずに警告として残して続ける。
 * 後片付けの失敗で巡回やレポートの書き出しを止めないため、例外は投げ直さない。
 */
export async function warnOnFailure(what: string, operation: Promise<unknown>, log: (message: string) => void): Promise<boolean> {
  try {
    await operation;
    return true;
  } catch (e) {
    log(`${what}に失敗しました: ${errorMessage(e)}`);
    return false;
  }
}
