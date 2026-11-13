import { expect, type Locator, type Page } from '@playwright/test';

/**
 * 管理コンソールの一覧画面（アシスタント・チャット履歴・学習データ）に共通の部品。
 * フィルター行（`.library-filters`）・並べ替え・ページ送り・件数表示・行・トーストを操作する。
 */

/**
 * 管理コンソールの画面を開く。ログイン直後は、ログイン後の画面（ダッシュボード）への遷移がまだ続いていることがあり、
 * その途中で移動すると `net::ERR_ABORTED` になる。サイドバーが出る（遷移が終わる）のを待ってから移動する。
 * vite の開発サーバーは初回の読み込みが遅いことがあるので、DOM の構築までを待つ。
 *
 * @param page ページ
 * @param path 開く画面のパス
 */
export async function gotoAdminPage(page: Page, path: string): Promise<void> {
  await expect(page.locator('aside').first()).toBeVisible();
  await page.goto(path, { waitUntil: 'domcontentloaded' });
}

/** フィルター行（検索・フィルター・並べ替え・上部のページ送り）。 */
export function filterRow(page: Page): Locator {
  return page.locator('.library-filters');
}

/** 一覧のデータ行（ヘッダー行を除く）。 */
export function dataRows(page: Page): Locator {
  return page.locator('.table-list-row--data');
}

/** データ行の見出し（表示名・チャット名など）の文字列を、画面に出ている順に取る。 */
export async function rowTitles(page: Page): Promise<string[]> {
  return dataRows(page).locator('.table-list-title').allTextContents();
}

/** 件数表示の正規表現（開始-終了件 / 総数件）。 */
export const COUNT_PATTERN = /(\d+)-(\d+)件 \/ (\d+)件/;

/**
 * 上部（フィルター行）のページ送りボタン。
 *
 * @param page ページ
 * @param name ボタン名（First page / Previous page / Next page / Last page）
 * @returns ボタン
 */
export function topPager(page: Page, name: 'First page' | 'Previous page' | 'Next page' | 'Last page'): Locator {
  return filterRow(page).getByRole('button', { name });
}

/** 一覧下部のページ送りボタン。 */
export function bottomPager(page: Page, name: 'Previous page' | 'Next page' | string): Locator {
  return page.getByRole('button', { name, exact: true }).last();
}

/**
 * 「選択肢から 1 つ選ぶ」ドロップダウン（`.app-select`）を開いて選ぶ。
 *
 * @param page ページ
 * @param host ドロップダウン全体
 * @param optionName 選ぶ選択肢の表示名
 */
export async function chooseFromSelect(page: Page, host: Locator, optionName: string): Promise<void> {
  await host.locator('.trigger-wrapper').click();
  await page.getByRole('option', { name: optionName, exact: true }).click();
}

/**
 * 並べ替えのメニュー（FormSortInput）で項目を選ぶ。
 *
 * @param page ページ
 * @param trigger 並べ替えのボタン
 * @param itemName 選ぶ項目（「更新日時順」「昇順」など）
 */
export async function chooseSortItem(page: Page, trigger: Locator, itemName: string): Promise<void> {
  await trigger.click();
  await page.getByRole('menuitemradio', { name: itemName, exact: true }).click();
  // メニューは項目を選んでも開いたままのことがあるので、閉じる
  if (await page.getByRole('menu').isVisible()) await page.keyboard.press('Escape');
}

/** 画面右上などに出るトースト（role=alert）。 */
export function toast(page: Page): Locator {
  return page.getByRole('alert');
}

/**
 * 一覧の読み込みが終わるまで待つ（表示中の行が出る、または空状態の文言が出る）。
 *
 * @param page ページ
 * @param emptyText 空状態の文言
 */
export async function waitForList(page: Page, emptyText: string): Promise<void> {
  await expect(dataRows(page).first().or(page.getByText(emptyText))).toBeVisible();
}

/**
 * 並べ替えの結果を「同じ値のまとまり」の並びにする（連続する同じ値を 1 つにする）。
 * 更新者名や学習設定のように同じ値の行が続く列で、並びの向き（昇順か降順か）だけを確かめるときに使う。
 *
 * @param values 列の値（上から順）
 * @returns 連続する重複を除いた値の並び
 */
export function groupOrder(values: string[]): string[] {
  return values.filter((value, index) => index === 0 || value !== values[index - 1]);
}

/** 期間フィルターで選べる範囲の指定（カレンダーで押す日）。月は「今月から何か月前か」で表す。 */
export interface CustomRange {
  fromMonthsAgo: number;
  fromDay: number;
  toMonthsAgo: number;
  toDay: number;
}

/**
 * 期間フィルター（PeriodFilter）の「期間を指定」で、カレンダーから開始日・終了日を選んで「決定」を押す。
 *
 * @param page ページ
 * @param testidPrefix 期間フィルターの data-testid の接頭辞（例: `admin-chat-history-period`）
 * @param range 開始日・終了日
 */
export async function chooseCustomPeriod(page: Page, testidPrefix: string, range: CustomRange): Promise<void> {
  await page.getByTestId(`${testidPrefix}-trigger`).click();
  await page.getByTestId(`${testidPrefix}-custom`).click();
  const pick = async (target: 'from' | 'to', monthsAgo: number, day: number) => {
    await page.getByTestId(`${testidPrefix}-${target}-input`).click();
    const calendar = page.locator('.datepicker');
    // 前の月へ戻る（先頭のボタンが「戻る」= 前の月）
    for (let i = 0; i < monthsAgo; i++) await calendar.getByRole('button', { name: '戻る' }).click();
    // 表示中の月以外の日（前月末・翌月初）はボタンではないので、日の名前のボタンは 1 つに決まる
    await calendar.getByRole('button', { name: String(day), exact: true }).click();
    // 日を選ぶと入力欄に日付が入る（期間の入力欄が閉じたら、ここで失敗する）
    await expect(page.getByTestId(`${testidPrefix}-${target}-input`), `${target} の日付が入力欄に入る`).not.toHaveValue('', {
      timeout: 10_000,
    });
  };
  await pick('from', range.fromMonthsAgo, range.fromDay);
  await pick('to', range.toMonthsAgo, range.toDay);
  await page.getByTestId(`${testidPrefix}-apply-button`).click();
}
