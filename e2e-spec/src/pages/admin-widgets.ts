import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 管理画面（ライブラリ・ワークスペース設定・ユーザー管理・チーム管理）で共通の部品（Select・並べ替え・ダイアログ・トースト）の操作。
 * 画面の部品は移植元と同じ作りなので、画面ごとの Page Object からここを使う。
 */

/** 画面の文言（public/i18n/ja.json。移植元の ja.json と同じ）。 */
export const COMMON_MESSAGES = {
  save: '保存',
  cancel: 'キャンセル',
  create: '作成',
  delete: '削除',
  noData: 'データがありません',
  required: 'この項目は必須です',
  asc: '昇順',
  desc: '降順',
} as const;

/**
 * 開いているダイアログを、タイトル（aria-label と同じ）で見つける。
 *
 * @param page ページ
 * @param title ダイアログのタイトル
 * @returns ダイアログのロケーター
 */
export function dialogOf(page: Page, title: string | RegExp): Locator {
  return page.getByRole('dialog', { name: title });
}

/**
 * ダイアログの確認ボタン（共通部品の data-testid）を押す。
 *
 * @param dialog ダイアログ
 */
export async function confirmDialog(dialog: Locator): Promise<void> {
  await dialog.getByTestId('dialog-confirm-button').click();
}

/**
 * ダイアログのキャンセルボタンを押す。
 *
 * @param dialog ダイアログ
 */
export async function cancelDialog(dialog: Locator): Promise<void> {
  await dialog.getByTestId('dialog-cancel-button').click();
}

/**
 * 成功トースト（右上）が出ている。
 *
 * @param page ページ
 * @param message トーストの文言
 */
export async function expectSuccessToast(page: Page, message: string): Promise<void> {
  await expect(page.getByTestId('toast-success').filter({ hasText: message })).toBeVisible();
}

/**
 * エラートースト（右上）が出ている。
 *
 * @param page ページ
 * @param message トーストの文言
 */
export async function expectErrorToast(page: Page, message: string): Promise<void> {
  await expect(page.getByTestId('toast-error').filter({ hasText: message })).toBeVisible();
}

/**
 * 画面の Select（`.app-select`）を、いま表示している文言（プレースホルダー含む）で見つける。
 *
 * @param scope 探す範囲
 * @param shownText Select に今出ている文言
 * @returns Select のロケーター
 */
export function selectShowing(scope: Page | Locator, shownText: string): Locator {
  return scope.locator('.app-select').filter({ hasText: shownText }).first();
}

/**
 * Select を開いて、選択肢を選ぶ。
 *
 * @param select Select のロケーター（`.app-select`）
 * @param optionLabel 選ぶ選択肢の文言（完全一致）
 */
export async function chooseSelectOption(select: Locator, optionLabel: string): Promise<void> {
  await select.locator('[aria-haspopup="listbox"]').first().click();
  await select.getByRole('option', { name: optionLabel, exact: true }).click();
}

/**
 * 並べ替え（FormSortInput）の項目・昇降を選ぶ。メニューは選ぶたびに閉じるので、項目→昇降の順に開き直す。
 *
 * @param sort 並べ替えの部品（`.app-form-sort-input`）
 * @param choice field: 並べ替え項目の文言、order: 昇順・降順（どちらも省略可）
 */
export async function chooseSort(sort: Locator, choice: { field?: string; order?: string }): Promise<void> {
  for (const label of [choice.field, choice.order]) {
    if (!label) continue;
    await sort.locator('[aria-haspopup="menu"]').first().click();
    await sort.getByRole('menuitemradio', { name: label, exact: true }).click();
    await expect(sort.getByRole('menu')).toHaveCount(0);
  }
}

/**
 * 画面に出ている行の文言を順に取り出す（並び順の確認用）。
 *
 * @param rows 行のロケーター
 * @param pick 行の中から文言を取る場所
 * @returns 文言の配列
 */
export async function textsOf(rows: Locator, pick: (row: Locator) => Locator): Promise<string[]> {
  const count = await rows.count();
  const texts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    texts.push((await pick(rows.nth(i)).innerText()).trim());
  }
  return texts;
}

/**
 * 文字列の配列が昇順（または降順）に並んでいる。
 *
 * @param values 並び順を調べる配列
 * @param direction 昇順 asc か降順 desc
 * @returns 期待どおりの並びなら true
 */
export function isSorted(values: string[], direction: 'asc' | 'desc'): boolean {
  const sorted = [...values].sort((a, b) => a.localeCompare(b, 'ja'));
  if (direction === 'desc') sorted.reverse();
  return values.every((value, index) => value === sorted[index]);
}

/**
 * ユーザーメニューの「管理コンソールへ切り替え」から管理コンソールに入り、サイドバーの項目から画面を開く。
 *
 * @param page ログイン済みのページ
 * @param sidebarTitle サイドバーの項目名（例: 「チーム管理」「ユーザー管理」「ワークスペース設定」）
 */
export async function openAdminConsolePage(page: Page, sidebarTitle: string): Promise<void> {
  await page.getByTestId('user-menu-button').click();
  await page.getByTestId('user-menu-switch-role-button').click();
  await page.getByTitle(sidebarTitle, { exact: true }).click();
}
