import type { Page, Response } from '@playwright/test';
import { createTemplate, deleteTemplate, findGroupId } from '../src/api-template.ts';
import { expect, test } from '../src/fixtures.ts';
import {
  TEMPLATE_MESSAGES as M,
  TEMPLATE_PAGE_SIZE,
  TemplatePage,
  type TemplateListBody,
} from '../src/pages/template.page.ts';
import { quote, sql, sqlNumber } from '../src/sql-e.ts';
import { TENANT_ID } from '../src/users.ts';

/**
 * 19_テンプレート（29 項目）。項目書: 25DA61_結合テスト項目書_md/19_テンプレート.md
 *
 * 移植元との対応:
 * - 項目書の「テンプレートを追加」は、画面の文言「テンプレートを新規作成」。「選択したテンプレートを削除」は「削除」（選択中に出るボタン）
 * - 項目 8 の備考（確認内容が間違い）: 「全ての所属チーム」は絞り込みなし（チームなしも含む全件）。移植元 template-list.component の
 *   `TEAM_FILTER_ALL` は team を API に送らない
 * - 件数・並び順の期待値は DB（SQL）から取る。検索の対象は、移植元の server に合わせて名前・説明
 * - 作成・削除などテストが作るデータは `spec19` で始まる名前にして、テストごとに消す
 * - 同じ DB の件数を数えるため、このファイルのテストは直列で流す
 */

// 直列（default）: fullyParallel の設定を上書きし、このファイルの中は 1 つのワーカーで順に流す（失敗しても残りは流れる）
test.describe.configure({ mode: 'default' });

const SPEC_PREFIX = 'spec19';
const SALES_TEAM = '営業部';
const DEV_TEAM = '開発部';
/** 一般ユーザー（user01）が所属するチーム。チャットのテンプレート選択に出る条件。 */
const CHAT_TEAM = '動作確認用グループ';
/**
 * 名前の最大長。移植元の画面は 100 文字まで入力できるが、移植元 server の DB（prompt_templates.name は varchar(32)）と
 * リクエストの検証は 32 文字まで。実際に作成できる最大の長さ（32）を「最大長」とする（backend の NAME_MAX_LENGTH も 32）。
 */
const NAME_MAX_LENGTH = 32;
const SYSTEM_PROMPT_MAX_LENGTH = 4000;

function totalTemplates(where = ''): number {
  return sqlNumber(`SELECT count(*) FROM prompt_templates t WHERE t.tenant_id = ${quote(TENANT_ID)} ${where}`);
}

function countText(total: number, page = 0): string {
  const from = page * TEMPLATE_PAGE_SIZE + 1;
  const to = Math.min((page + 1) * TEMPLATE_PAGE_SIZE, total);
  return `${from}-${to}件 / ${total}件`;
}

function teamTemplateWhere(teamName: string): string {
  return `AND t.id IN (SELECT gt.prompt_template_id FROM groups_prompt_templates gt JOIN groups g ON g.id = gt.group_id WHERE g.name = ${quote(teamName)} AND g.tenant_id = ${quote(TENANT_ID)})`;
}

async function bodyOf(response: Response): Promise<TemplateListBody> {
  expect(response.ok(), `一覧 API が失敗: ${response.status()}`).toBe(true);
  return (await response.json()) as TemplateListBody;
}

function expectOrdered(values: string[], order: 'asc' | 'desc'): void {
  const sorted = [...values].sort();
  if (order === 'desc') sorted.reverse();
  expect(values).toEqual(sorted);
}

/** 名前の降順・昇順の期待値（DB の並び）。 */
function namesFromDb(order: 'ASC' | 'DESC', where = '', limit = TEMPLATE_PAGE_SIZE, offset = 0): string[] {
  return sql(
    `SELECT t.name FROM prompt_templates t WHERE t.tenant_id = ${quote(TENANT_ID)} ${where} ORDER BY t.name ${order} LIMIT ${limit} OFFSET ${offset}`
  ).map((row) => row[0]);
}

/** ダイアログで作成して、作成の応答を待つ。 */
async function submitCreate(page: Page, tp: TemplatePage): Promise<void> {
  const created = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/admin/prompt-templates' && r.request().method() === 'POST');
  await tp.dialogConfirm.click();
  const response = await created;
  expect(response.ok(), `作成 API が失敗: ${response.status()}`).toBe(true);
}

test.describe('19_テンプレート', () => {
  test.afterEach(async ({ adminApi }) => {
    // このテストが作ったデータ（API で作ったもの・画面で作ったもの）を消す
    const ids = sql(`SELECT id FROM prompt_templates WHERE tenant_id = ${quote(TENANT_ID)} AND name LIKE ${quote(`${SPEC_PREFIX}%`)}`);
    for (const [id] of ids) await deleteTemplate(adminApi, id);
  });

  test('[19-01] 一覧表示', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    const body = await bodyOf(await tp.open());
    await expect(page).toHaveURL(/\/admin\/templates/);
    for (const header of ['テンプレート名', 'システムプロンプト', '所属チーム', '更新日時']) {
      await expect(tp.main.getByText(header, { exact: true }).first()).toBeVisible();
    }
    await expect(tp.rows).toHaveCount(Math.min(TEMPLATE_PAGE_SIZE, totalTemplates()));
    expect(body.totalElements).toBe(totalTemplates());
  });

  test('[19-02] 新規作成', async ({ loginAs, page, uniqueId }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const name = uniqueId(SPEC_PREFIX);
    await tp.addButton.click();
    await expect(tp.dialog.getByText(M.addTitle)).toBeVisible();
    await tp.fillForm({ name, systemPrompt: 'あなたは新規作成のテストです。', description: '新規作成の説明' });
    await submitCreate(page, tp);
    // 作成後の一覧に追加される
    await tp.search(name);
    await expect(tp.rowByName(name)).toHaveCount(1);
    expect(totalTemplates(`AND t.name = ${quote(name)}`)).toBe(1);
  });

  test('[19-03] 必須未入力', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const before = totalTemplates();
    await tp.addButton.click();
    const nameInput = tp.dialog.getByPlaceholder(M.namePlaceholder);
    await nameInput.focus();
    await nameInput.blur();
    await tp.dialog.getByPlaceholder(M.promptPlaceholder).fill('システムプロンプトだけ入力');
    // 名前が空のままでは作成できず、必須エラーが出る
    await expect(tp.dialog.getByText(M.required).first()).toBeVisible();
    await expect(tp.dialogConfirm).toBeDisabled();
    expect(totalTemplates()).toBe(before);
  });

  test('[19-04] 編集', async ({ loginAs, page, adminApi, uniqueId }) => {
    const name = uniqueId(SPEC_PREFIX);
    const template = await createTemplate(adminApi, { name, systemPrompt: '編集前のプロンプト' });
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.search(name);
    await tp.clickRowMenu(tp.rowByName(name), M.editAction);
    await expect(tp.dialog.getByText(M.editTitle)).toBeVisible();
    const renamed = `${name}b`;
    await tp.fillForm({ name: renamed, systemPrompt: '編集後のプロンプト' });
    const updated = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/admin/prompt-templates/${template.id}` && r.request().method() === 'PATCH');
    await tp.dialogConfirm.click();
    expect((await updated).ok()).toBe(true);
    await tp.search(renamed);
    await expect(tp.rowByName(renamed)).toContainText('編集後のプロンプト');
    expect(sql(`SELECT name, system_prompt FROM prompt_templates WHERE id = ${quote(template.id)}`)[0]).toEqual([renamed, '編集後のプロンプト']);
  });

  test('[19-05] 削除（個別）', async ({ loginAs, page, adminApi, uniqueId }) => {
    const name = uniqueId(SPEC_PREFIX);
    const template = await createTemplate(adminApi, { name, systemPrompt: '個別削除のテスト' });
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.search(name);
    await tp.clickRowMenu(tp.rowByName(name), M.deleteAction);
    await expect(tp.dialog.getByText(M.deleteTitle)).toBeVisible();
    await expect(tp.dialog.getByText(M.deleteMessage)).toBeVisible();
    const deleted = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/admin/prompt-templates/${template.id}` && r.request().method() === 'DELETE');
    await tp.dialogConfirm.click();
    expect((await deleted).status()).toBeLessThan(300);
    await expect(tp.rowByName(name)).toHaveCount(0);
    expect(totalTemplates(`AND t.id = ${quote(template.id)}`)).toBe(0);
  });

  test('[19-06] 検索', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const response = await tp.search('メール');
    const body = await bodyOf(response);
    const expected = totalTemplates(`AND (t.name ILIKE '%メール%' OR t.description ILIKE '%メール%')`);
    expect(expected).toBeGreaterThan(0);
    expect(body.totalElements).toBe(expected);
    await expect(tp.rows).toHaveCount(expected);
    expect(body.content.every((item) => `${item.name}${item.description ?? ''}`.includes('メール'))).toBe(true);
  });

  test('[19-07] 検索（0件）', async ({ loginAs, page, uniqueId }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const response = await tp.search(`存在しない${uniqueId('x')}`);
    expect((await bodyOf(response)).totalElements).toBe(0);
    await expect(tp.rows).toHaveCount(0);
    await expect(tp.emptyMessage).toBeVisible();
  });

  test('[19-08] 所属チームフィルター（すべて）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    // いったん別のチームにしてから「全ての所属チーム」に戻す
    await tp.filterTeam(SALES_TEAM);
    const response = await tp.filterTeam(M.allTeams);
    const body = await bodyOf(response);
    expect(new URL(response.url()).searchParams.has('team')).toBe(false);
    expect(body.totalElements).toBe(totalTemplates());
    await expect(tp.countText).toHaveText(countText(totalTemplates()));
    // チームに所属するテンプレート・所属しないテンプレートの両方が含まれる
    expect(totalTemplates(`AND t.id IN (SELECT prompt_template_id FROM groups_prompt_templates)`)).toBeGreaterThan(0);
  });

  test('[19-09] 所属チームフィルター（チームなし）', async ({ loginAs, page, adminApi, uniqueId }) => {
    // seed のテンプレートはすべてチームに所属するため、チーム未所属のテンプレートを 1 件作る
    const name = uniqueId(SPEC_PREFIX);
    await createTemplate(adminApi, { name, systemPrompt: 'チームなしのテンプレート' });
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const response = await tp.filterTeam(M.noTeam);
    const body = await bodyOf(response);
    const expected = totalTemplates(`AND t.id NOT IN (SELECT prompt_template_id FROM groups_prompt_templates)`);
    expect(expected).toBeGreaterThan(0);
    expect(body.totalElements).toBe(expected);
    expect(body.content.every((item) => (item.groups ?? []).length === 0)).toBe(true);
    await expect(tp.countText).toHaveText(countText(expected));
  });

  test('[19-10] 所属チームフィルター（特定チーム）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const response = await tp.filterTeam(SALES_TEAM);
    const body = await bodyOf(response);
    const expected = totalTemplates(teamTemplateWhere(SALES_TEAM));
    expect(expected).toBeGreaterThan(0);
    expect(body.totalElements).toBe(expected);
    expect(body.content.every((item) => (item.groups ?? []).includes(SALES_TEAM))).toBe(true);
    await expect(tp.countText).toHaveText(countText(expected));
    expect((await tp.readRows()).every((row) => row.join(' ').includes(SALES_TEAM))).toBe(true);
  });

  test('[19-11] 並替（更新日時）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    // 既定が「更新日時順」のため、いったん別の項目にしてから選び直す
    await tp.sort(M.sortByName);
    const response = await tp.sort(M.sortByUpdated);
    expect(new URL(response.url()).searchParams.get('sort')).toBe('updatedAt,desc');
    const body = await bodyOf(response);
    expectOrdered(body.content.map((item) => item.updatedAt), 'desc');
  });

  test('[19-12] 並替（テンプレート名）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const response = await tp.sort(M.sortByName);
    expect(new URL(response.url()).searchParams.get('sort')).toBe('name,desc');
    const body = await bodyOf(response);
    expect(body.content.map((item) => item.name)).toEqual(namesFromDb('DESC'));
    // 画面の 1 行目の名前は、応答の 1 行目と同じ（名前の欄には説明が続く）
    expect((await tp.readRows())[0][0]).toContain(body.content[0].name);
  });

  test('[19-13] 並替（昇順/降順）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.sort(M.sortByName);
    const ascending = await bodyOf(await tp.sort(M.sortAsc));
    expect(ascending.content.map((item) => item.name)).toEqual(namesFromDb('ASC'));
    const descending = await bodyOf(await tp.sort(M.sortDesc));
    expect(descending.content.map((item) => item.name)).toEqual(namesFromDb('DESC'));
  });

  test('[19-14] ページ送り（上部）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    // 更新日時は seed で同じ値のため、重複しない名前順で並べてから次のページへ
    await tp.sort(M.sortByName);
    const total = totalTemplates();
    const second = await bodyOf(await tp.reloadedBy(() => tp.topNextPage.click()));
    expect(second.content.map((item) => item.name)).toEqual(namesFromDb('DESC', '', TEMPLATE_PAGE_SIZE, TEMPLATE_PAGE_SIZE));
    await expect(tp.countText).toHaveText(countText(total, 1));
    await expect(tp.rows).toHaveCount(Math.min(TEMPLATE_PAGE_SIZE, total - TEMPLATE_PAGE_SIZE));
  });

  test('[19-15] ページ送り（下部）', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.sort(M.sortByName);
    const total = totalTemplates();
    const second = await bodyOf(await tp.reloadedBy(() => tp.bottomNextPage.click()));
    expect(second.content.map((item) => item.name)).toEqual(namesFromDb('DESC', '', TEMPLATE_PAGE_SIZE, TEMPLATE_PAGE_SIZE));
    await expect(tp.countText).toHaveText(countText(total, 1));
  });

  test('[19-16] 件数表示', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await expect(tp.countText).toHaveText(countText(totalTemplates()));
    await tp.filterTeam(SALES_TEAM);
    await expect(tp.countText).toHaveText(countText(totalTemplates(teamTemplateWhere(SALES_TEAM))));
  });

  test('[19-17] 一括選択', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await expect(tp.addButton).toBeVisible();
    await tp.checkboxOf(tp.rows.nth(0)).click();
    await tp.checkboxOf(tp.rows.nth(1)).click();
    await expect(tp.deselectButton).toBeVisible();
    await expect(tp.deleteSelectedButton).toBeVisible();
    // 選択中は「テンプレートを新規作成」が隠れる
    await expect(tp.addButton).toHaveCount(0);
  });

  test('[19-18] 一括削除', async ({ loginAs, page, adminApi, uniqueId }) => {
    const prefix = uniqueId(SPEC_PREFIX);
    const names = [`${prefix}a`, `${prefix}b`, `${prefix}c`];
    const ids: string[] = [];
    for (const name of names) ids.push((await createTemplate(adminApi, { name, systemPrompt: '一括削除のテスト' })).id);
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.search(prefix);
    await expect(tp.rows).toHaveCount(3);
    await tp.checkboxOf(tp.rows.nth(0)).click();
    await tp.checkboxOf(tp.rows.nth(1)).click();
    await tp.checkboxOf(tp.rows.nth(2)).click();
    await tp.deleteSelectedButton.click();
    await expect(tp.dialog.getByText(M.deleteTitle)).toBeVisible();
    const deleted = Promise.all(
      ids.map((id) => page.waitForResponse((r) => new URL(r.url()).pathname === `/api/admin/prompt-templates/${id}` && r.request().method() === 'DELETE'))
    );
    await tp.dialogConfirm.click();
    for (const response of await deleted) expect(response.status()).toBeLessThan(300);
    await expect(tp.rows).toHaveCount(0);
    expect(totalTemplates(`AND t.name LIKE ${quote(`${prefix}%`)}`)).toBe(0);
  });

  test('[19-19] 全選択', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.headerCheckbox.click();
    const count = await tp.rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index++) await expect(tp.checkboxOf(tp.rows.nth(index))).toBeChecked();
    await expect(tp.deselectButton).toBeVisible();
  });

  test('[19-20] 選択解除', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.checkboxOf(tp.rows.nth(0)).click();
    await expect(tp.checkboxOf(tp.rows.nth(0))).toBeChecked();
    await tp.deselectButton.click();
    await expect(tp.checkboxOf(tp.rows.nth(0))).not.toBeChecked();
    await expect(tp.deselectButton).toHaveCount(0);
    await expect(tp.addButton).toBeVisible();
  });

  test('[19-21] チーム紐付（作成時）', async ({ loginAs, page, uniqueId }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const name = uniqueId(SPEC_PREFIX);
    await tp.addButton.click();
    await tp.fillForm({ name, systemPrompt: 'チーム紐付のテスト' });
    await tp.selectTeams([SALES_TEAM, DEV_TEAM]);
    // 作成のあと、選んだ 2 チームへの紐付け（POST /api/admin/groups/{id}/prompt-templates）が成功する
    const linked = Promise.all(
      [0, 1].map(() =>
        page.waitForResponse((r) => /\/api\/admin\/groups\/[^/]+\/prompt-templates$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST')
      )
    );
    await submitCreate(page, tp);
    for (const response of await linked) expect(response.status(), 'チームへの紐付け').toBeLessThan(300);
    // 選んだチームがフィルターで選べ、そのチームで絞ると作成したテンプレートが出る
    expect(totalTemplates(`AND t.name = ${quote(name)} ${teamTemplateWhere(SALES_TEAM)}`)).toBe(1);
    expect(totalTemplates(`AND t.name = ${quote(name)} ${teamTemplateWhere(DEV_TEAM)}`)).toBe(1);
    for (const team of [SALES_TEAM, DEV_TEAM]) {
      const response = await tp.filterTeam(team);
      const body = await bodyOf(response);
      expect(body.content.map((item) => item.name)).toContain(name);
      await tp.search(name);
      await expect(tp.rowByName(name)).toContainText(team);
      await tp.searchInput.fill('');
    }
  });

  test('[19-22] チャット連携', async ({ loginAs, page, adminApi, uniqueId }) => {
    const name = uniqueId(SPEC_PREFIX);
    await createTemplate(adminApi, { name, systemPrompt: 'チャット連携のプロンプト', groupIds: [await findGroupId(adminApi, CHAT_TEAM)] });
    // 一般ユーザーが、所属チームに紐づくテンプレートをチャットで選べる
    await loginAs('user');
    await openTemplateMenu(page);
    const option = page.getByRole('menu').getByText(name, { exact: true });
    await expect(option).toBeVisible();
    await option.click();
    // 選ぶと、入力欄の近くに選択中のテンプレートとして表示される
    await expect(page.locator('.chat-active-button-text').filter({ hasText: name }).first()).toBeVisible();
  });

  test('[19-23] テンプレート0件', async ({ loginAs, page }) => {
    // テンプレートを全部退避して 0 件にし、終わったら戻す（seed のデータを壊さない）
    const backup = `spec19_bak_${Date.now()}`;
    sql(`
      CREATE TABLE ${backup}_t AS SELECT * FROM prompt_templates WHERE tenant_id = ${quote(TENANT_ID)};
      CREATE TABLE ${backup}_g AS SELECT * FROM groups_prompt_templates WHERE tenant_id = ${quote(TENANT_ID)};
      DELETE FROM groups_prompt_templates WHERE tenant_id = ${quote(TENANT_ID)};
      DELETE FROM prompt_templates WHERE tenant_id = ${quote(TENANT_ID)};
    `);
    try {
      await loginAs('tenantAdmin');
      const tp = new TemplatePage(page);
      const body = await bodyOf(await tp.open());
      expect(body.totalElements).toBe(0);
      await expect(tp.rows).toHaveCount(0);
      await expect(tp.emptyMessage).toBeVisible();
    } finally {
      sql(`
        INSERT INTO prompt_templates SELECT * FROM ${backup}_t;
        INSERT INTO groups_prompt_templates SELECT * FROM ${backup}_g;
        DROP TABLE ${backup}_t;
        DROP TABLE ${backup}_g;
      `);
    }
  });

  test('[19-24] 検索＋チームフィルター', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.filterTeam(CHAT_TEAM);
    const response = await tp.search('ページ送り');
    const body = await bodyOf(response);
    const expected = totalTemplates(`AND (t.name ILIKE '%ページ送り%' OR t.description ILIKE '%ページ送り%') ${teamTemplateWhere(CHAT_TEAM)}`);
    expect(expected).toBeGreaterThan(0);
    expect(body.totalElements).toBe(expected);
    expect(new URL(response.url()).searchParams.has('team')).toBe(true);
    expect(body.content.every((item) => (item.groups ?? []).includes(CHAT_TEAM) && item.name.includes('ページ送り'))).toBe(true);
    // 別のチームに替えると、検索語を満たしてもそのチームに所属しないテンプレートは出ない
    const other = await bodyOf(await tp.filterTeam(SALES_TEAM));
    expect(other.content.every((item) => (item.groups ?? []).includes(SALES_TEAM))).toBe(true);
    expect(other.totalElements).toBe(totalTemplates(`AND (t.name ILIKE '%ページ送り%' OR t.description ILIKE '%ページ送り%') ${teamTemplateWhere(SALES_TEAM)}`));
  });

  test('[19-25] 作成→チャット利用', async ({ loginAs, page, adminApi, uniqueId }) => {
    const name = uniqueId(SPEC_PREFIX);
    const systemPrompt = `送信に添えるプロンプト ${name}`;
    await createTemplate(adminApi, { name, systemPrompt, groupIds: [await findGroupId(adminApi, CHAT_TEAM)] });
    await loginAs('user');
    await openTemplateMenu(page);
    await page.getByRole('menu').getByText(name, { exact: true }).click();
    const question = `テンプレートで質問 ${name}`;
    await page.getByTestId('chat-input-textarea').fill(question);
    const sent = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/messages' && r.method() === 'POST');
    await page.getByTestId('chat-send-button').click();
    const request = await sent;
    // 選んだテンプレートのシステムプロンプトが、送信内容に付く
    expect(request.postData() ?? '').toContain(systemPrompt);
    expect(request.postData() ?? '').toContain(question);
  });

  test('[19-26] フィルター＋並べ替え', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await tp.filterTeam(SALES_TEAM);
    const where = teamTemplateWhere(SALES_TEAM);
    const asc = await bodyOf(await tp.sort(M.sortByName).then(() => tp.sort(M.sortAsc)));
    expect(asc.content.map((item) => item.name)).toEqual(namesFromDb('ASC', where));
    const desc = await bodyOf(await tp.sort(M.sortDesc));
    expect(desc.content.map((item) => item.name)).toEqual(namesFromDb('DESC', where));
    expect(desc.content.every((item) => (item.groups ?? []).includes(SALES_TEAM))).toBe(true);
  });

  test('[19-27] プロンプト最大長', async ({ loginAs, page, uniqueId }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const name = uniqueId(SPEC_PREFIX);
    const longPrompt = 'あ'.repeat(SYSTEM_PROMPT_MAX_LENGTH);
    await tp.addButton.click();
    await tp.fillForm({ name, systemPrompt: longPrompt });
    await submitCreate(page, tp);
    expect(sqlNumber(`SELECT length(system_prompt) FROM prompt_templates WHERE name = ${quote(name)}`)).toBe(SYSTEM_PROMPT_MAX_LENGTH);
  });

  test('[19-28] 名前最大長', async ({ loginAs, page }) => {
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    const name = SPEC_PREFIX + 'n'.repeat(NAME_MAX_LENGTH - SPEC_PREFIX.length);
    expect(name.length).toBe(NAME_MAX_LENGTH);
    await tp.addButton.click();
    await tp.fillForm({ name, systemPrompt: '名前の最大長のテスト' });
    await submitCreate(page, tp);
    expect(totalTemplates(`AND t.name = ${quote(name)}`)).toBe(1);
  });

  test('[19-29] テンプレート Chrome', async ({ loginAs, page, uniqueId, browserName }) => {
    // Playwright の Chromium（Chrome と同じエンジン）で一覧・作成・削除を行う
    expect(browserName).toBe('chromium');
    await loginAs('tenantAdmin');
    const tp = new TemplatePage(page);
    await tp.open();
    await expect(tp.rows.first()).toBeVisible();
    const name = uniqueId(SPEC_PREFIX);
    await tp.addButton.click();
    await tp.fillForm({ name, systemPrompt: 'Chrome のテスト' });
    await submitCreate(page, tp);
    await tp.search(name);
    await expect(tp.rowByName(name)).toHaveCount(1);
    await tp.clickRowMenu(tp.rowByName(name), M.deleteAction);
    await tp.dialogConfirm.click();
    await expect(tp.rowByName(name)).toHaveCount(0);
    expect(totalTemplates(`AND t.name = ${quote(name)}`)).toBe(0);
  });
});

/** チャット画面を開き、入力欄の「＋」から「テンプレート」の選択肢を開く。 */
async function openTemplateMenu(page: Page): Promise<void> {
  await page.goto('/chat/new');
  await page.getByTestId('chat-attach-button').click();
  await page.getByRole('menuitem', { name: 'テンプレート' }).click();
}
