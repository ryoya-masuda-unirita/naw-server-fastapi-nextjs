import { deleteUser, type CreatedUser } from '../src/api.ts';
import {
  addGroupAssistants,
  addGroupTemplates,
  addGroupUsers,
  assistantIdsByName,
  createAssistant,
  createCategory,
  createGroup,
  createTemplate,
  createUsers,
  deleteAssistant,
  deleteCategory,
  deleteGroup,
  deleteGroupsByPrefix,
  deleteTemplate,
  setGroupUserRole,
  type TestAssistant,
  type TestGroup,
  type TestTemplate,
} from '../src/api-team.ts';
import { expect, test as base } from '../src/fixtures.ts';
import { confirmDialog, dialogOf, expectSuccessToast, textsOf } from '../src/pages/admin-widgets.ts';
import {
  TEAM_LIST_PAGE_SIZE,
  TEAM_MESSAGES,
  TEAM_NAME_MAX_LENGTH,
  TEAM_TAB_PAGE_SIZE,
  TeamPage,
} from '../src/pages/team.page.ts';

/**
 * 14_チーム管理（71 項目）。項目書: 25DA61_結合テスト項目書_md/14_チーム管理.md
 *
 * 移植元との対応（項目書の文言は古い画面のもの。移植元の現在の画面と ja.json に合わせる）:
 * - 件数表示は「1-5件 / 6件」（項番 12 の「○件中○〜○件」は古い文言）
 * - 所属ユーザーの一括削除ボタンは「削除」、所属テンプレート・アシスタントは「チームから削除」（項番 29・43・60）
 * - 項番 15「チーム削除（詳細）」: 設定メニュー（鉛筆アイコン）→「チームを削除」（テナント管理者のみ）
 * - 項番 37・52「追加日時順」: 並べ替えの項目名は、テンプレートが「更新日時順」、アシスタントが「追加日時順」。値は所属への追加日時
 * - アシスタントの並べ替え「カテゴリ順」は、移植元 GroupService が `assistant.categoryMappings.category.name`（カテゴリ名）で並べる。カテゴリ名の昇降で確かめる
 * - 項番 50「サーバーフィルター（クラウド指定）」: 項目書は後回しだったが、専用環境にはクラウド(学習先指定)の seed があるため自動で確かめる
 * - チームの各タブの 1 ページは 25 件。ページ送りは 26 件を API で用意して確かめる
 * - Chrome の項目（71）は、このテストの実行ブラウザ（Chromium）で主要操作を通す
 */

interface TeamSetup {
  /** 所属させるユーザー（先頭から順に追加する）。admin: true はチームの管理者。 */
  users?: { user: CreatedUser; admin?: boolean }[];
  /** 所属させるアシスタント（名前。先頭から順に追加する）。 */
  assistants?: string[];
  /** 所属させるテンプレート（先頭から順に追加する）。 */
  templates?: TestTemplate[];
}

interface TeamFixtures {
  teamPage: TeamPage;
  /** このテスト専用の接頭辞（チーム名・テンプレート名・アシスタント名に使う）。 */
  prefix: string;
  /** チームを API で作り、所属を足す（終了時に自動削除）。 */
  makeGroup: (suffix: string, setup?: TeamSetup) => Promise<TestGroup>;
  /** テンプレートを API で作る（終了時に自動削除）。 */
  makeTemplate: (suffix: string) => Promise<TestTemplate>;
  /** クラウド(一般)のアシスタントを API で作る（終了時に自動削除）。 */
  makeAssistant: (suffix: string, categoryNames?: string[]) => Promise<TestAssistant>;
  /** カテゴリを API で作る（終了時に自動削除）。 */
  makeCategory: (suffix: string) => Promise<{ id: string; name: string }>;
  /** テスト用ユーザーをまとめて作る（終了時に自動削除）。 */
  makeUsers: (count: number, nameFor: (index: number) => string) => Promise<CreatedUser[]>;
  /** seed のアシスタントの ID（名前 → ID）。 */
  seedAssistantIds: Map<string, string>;
}

/** seed-demo.sql のアシスタント（名前と、画面に出る接続サーバーの表示）。 */
const SEED = {
  cloudGeneral: { name: '汎用アシスタント', server: 'クラウド(一般)', category: '業務効率化' },
  local: { name: '営業ナレッジ検索（社内）', server: 'ローカル', category: 'ナレッジ検索' },
  cloudSpecified: { name: '社内ヘルプデスク', server: 'クラウド(学習先指定)', category: 'ナレッジ検索' },
} as const;

const test = base.extend<TeamFixtures>({
  teamPage: async ({ page }, use) => {
    await use(new TeamPage(page));
  },

  prefix: async ({ uniqueId }, use) => {
    await use(uniqueId('tm'));
  },

  seedAssistantIds: async ({ adminApi }, use) => {
    await use(await assistantIdsByName(adminApi));
  },

  makeGroup: async ({ adminApi, prefix, seedAssistantIds }, use) => {
    const groups: TestGroup[] = [];
    await use(async (suffix, setup = {}) => {
      const group = await createGroup(adminApi, `${prefix}-${suffix}`);
      groups.push(group);
      // 追加日時で並べ替える項目があるため、1 件ずつ順に追加する
      for (const { user, admin } of setup.users ?? []) {
        await addGroupUsers(adminApi, group.id, [user.id]);
        if (admin) await setGroupUserRole(adminApi, group.id, user.id, true);
      }
      for (const name of setup.assistants ?? []) {
        const id = seedAssistantIds.get(name) ?? name;
        await addGroupAssistants(adminApi, group.id, [id]);
      }
      for (const template of setup.templates ?? []) await addGroupTemplates(adminApi, group.id, [template.id]);
      return group;
    });
    for (const group of groups) await deleteGroup(adminApi, group.id);
    await deleteGroupsByPrefix(adminApi, prefix);
  },

  makeTemplate: async ({ adminApi, prefix }, use) => {
    const templates: TestTemplate[] = [];
    await use(async (suffix) => {
      const template = await createTemplate(adminApi, `${prefix}-${suffix}`);
      templates.push(template);
      return template;
    });
    for (const template of templates) await deleteTemplate(adminApi, template.id);
  },

  makeCategory: async ({ adminApi, prefix }, use) => {
    const categories: { id: string; name: string }[] = [];
    await use(async (suffix) => {
      const category = await createCategory(adminApi, `${prefix}-${suffix}`);
      categories.push(category);
      return category;
    });
    // アシスタントを先に消してからカテゴリを消す（fixture の後片付けは登録の逆順に動く）
    for (const category of categories) await deleteCategory(adminApi, category.id);
  },

  makeAssistant: async ({ adminApi, prefix, makeCategory }, use) => {
    const assistants: TestAssistant[] = [];
    const categoryIdByName = new Map<string, string>();
    await use(async (suffix, categoryNames = []) => {
      const ids: string[] = [];
      for (const categoryName of categoryNames) {
        let id = categoryIdByName.get(categoryName);
        if (!id) {
          id = (await makeCategory(categoryName)).id;
          categoryIdByName.set(categoryName, id);
        }
        ids.push(id);
      }
      const assistant = await createAssistant(adminApi, `${prefix}-${suffix}`, ids);
      assistants.push(assistant);
      return assistant;
    });
    for (const assistant of assistants) await deleteAssistant(adminApi, assistant.id);
  },

  makeUsers: async ({ adminApi, prefix }, use) => {
    const users: CreatedUser[] = [];
    await use(async (count, nameFor) => {
      const created = await createUsers(
        adminApi,
        count,
        (index) => `${prefix}-u${String(index).padStart(2, '0')}`,
        nameFor,
      );
      users.push(...created);
      return created;
    });
    await Promise.all(users.map((user) => deleteUser(adminApi, user)));
  },
});

/** テスト用ユーザーを 1 人作る（表示名はユーザー ID と同じ）。 */
type MakeUsers = TeamFixtures['makeUsers'];

/**
 * 名前を指定してテスト用ユーザーを作る。
 *
 * @param makeUsers makeUsers fixture
 * @param prefix 接頭辞
 * @param suffixes 名前の末尾（`${prefix}-${suffix}` が表示名になる）
 * @returns 作ったユーザー（suffixes と同じ順）
 */
async function usersNamed(makeUsers: MakeUsers, prefix: string, suffixes: string[]): Promise<CreatedUser[]> {
  return makeUsers(suffixes.length, (index) => `${prefix}-${suffixes[index]}`);
}

test.describe('14_チーム管理', () => {
  // ---------- 一覧 ----------

  test('[14-01] 一覧表示', async ({ loginAs, teamPage, makeGroup, prefix, page }) => {
    await makeGroup('list');
    await loginAs('tenantAdmin');
    await teamPage.openFromSidebar();
    await teamPage.search(prefix);
    await expect(teamPage.cards).toHaveCount(1);
    const card = teamPage.card(prefix);
    for (const label of ['管理者', '所属ユーザー', '所属アシスタント', '所属テンプレート', '更新日時']) {
      await expect(card.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(card.getByRole('button', { name: TEAM_MESSAGES.viewAndEdit })).toBeVisible();
    await expect(page.getByTestId('admin-groups-create-button')).toBeVisible();
  });

  test('[14-02] チーム新規作成', async ({ loginAs, teamPage, page, prefix, adminApi }) => {
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    try {
      const dialog = await teamPage.openCreateDialog();
      await dialog.getByTestId('admin-groups-name-input').fill(`${prefix}-new`);
      await confirmDialog(dialog);
      await expectSuccessToast(page, TEAM_MESSAGES.createSuccess);
      await teamPage.search(prefix);
      await expect(teamPage.card(`${prefix}-new`)).toBeVisible();
    } finally {
      await deleteGroupsByPrefix(adminApi, prefix);
    }
  });

  test('[14-03] 必須未入力（作成）', async ({ loginAs, teamPage, page }) => {
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    const dialog = await teamPage.openCreateDialog();
    await confirmDialog(dialog);
    await expect(dialog.getByText('この項目は必須です')).toBeVisible();
    await expect(page.getByTestId('toast-success')).toHaveCount(0);
  });

  test('[14-04] 詳細遷移', async ({ loginAs, teamPage, makeGroup, prefix, page }) => {
    const group = await makeGroup('detail');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await teamPage.card(group.name).getByTestId('admin-groups-view-edit-button').click();
    await expect(page).toHaveURL(new RegExp(`/admin/groups/${group.id}`));
  });

  test('[14-05] 一覧検索', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    const apple = await makeGroup('apple');
    await makeGroup('banana');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.cards).toHaveCount(2);
    await teamPage.search(`${prefix}-app`);
    await expect(teamPage.cards).toHaveCount(1);
    await expect(teamPage.card(apple.name)).toBeVisible();
  });

  test('[14-06] 一覧検索（0件）', async ({ loginAs, teamPage, prefix, page }) => {
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(`${prefix}-存在しない`);
    await expect(teamPage.cards).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noData)).toBeVisible();
  });

  test('[14-07] 一覧並替（更新日時）', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    // 作成順 c → a → b（更新日時の新しい順 = b, a, c）
    await makeGroup('c');
    await makeGroup('a');
    await makeGroup('b');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.cards).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortUpdated, order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.cardNames()).toEqual([`${prefix}-b`, `${prefix}-a`, `${prefix}-c`]);
  });

  test('[14-08] 一覧並替（チーム名）', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    await makeGroup('c');
    await makeGroup('a');
    await makeGroup('b');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.cards).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.cardNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[14-09] 一覧並替（昇順/降順）', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    await makeGroup('a');
    await makeGroup('b');
    await makeGroup('c');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.cards).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.cardNames()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.cardNames()).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[14-10] 一覧ページ送り（上部）', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    for (let i = 0; i <= TEAM_LIST_PAGE_SIZE; i += 1) await makeGroup(`p${i}`);
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.countDisplay).toHaveText(`1-5件 / ${TEAM_LIST_PAGE_SIZE + 1}件`);
    await expect(teamPage.cards).toHaveCount(TEAM_LIST_PAGE_SIZE);
    await teamPage.topNext.click();
    await expect(teamPage.cards).toHaveCount(1);
  });

  test('[14-11] 一覧ページ送り（下部）', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    for (let i = 0; i <= TEAM_LIST_PAGE_SIZE; i += 1) await makeGroup(`p${i}`);
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.countDisplay).toHaveText(`1-5件 / ${TEAM_LIST_PAGE_SIZE + 1}件`);
    await teamPage.bottomNext.click();
    await expect(teamPage.cards).toHaveCount(1);
  });

  test('[14-12] 一覧件数表示', async ({ loginAs, teamPage, makeGroup, prefix }) => {
    await makeGroup('n1');
    await makeGroup('n2');
    await makeGroup('n3');
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    await teamPage.search(prefix);
    await expect(teamPage.countDisplay).toHaveText('1-3件 / 3件');
  });

  // ---------- 詳細 ----------

  test('[14-13] 詳細ヘッダー表示', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeGroup('header');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id);
    await expect(teamPage.detailTitle).toHaveText(group.name);
    for (const label of Object.values(TEAM_MESSAGES.tabLabels)) {
      await expect(teamPage.tablist.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('[14-14] チーム名編集', async ({ loginAs, teamPage, makeGroup, page, prefix }) => {
    const group = await makeGroup('before');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id);
    await teamPage.detailMenu('admin-groups-edit-name-button');
    const dialog = dialogOf(page, TEAM_MESSAGES.editTitle);
    await dialog.getByTestId('admin-groups-name-input').fill(`${prefix}-after`);
    await confirmDialog(dialog);
    await expectSuccessToast(page, TEAM_MESSAGES.updateSuccess);
    await expect(teamPage.detailTitle).toHaveText(`${prefix}-after`);
  });

  test('[14-15] チーム削除（詳細）', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('delete');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id);
    await teamPage.detailMenu('admin-groups-delete-button');
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteMenu));
    await expectSuccessToast(page, TEAM_MESSAGES.deleteSuccess);
    await expect(page).toHaveURL(/\/admin\/groups$/);
  });

  test('[14-16] 戻る操作', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('back');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id);
    await page.getByTitle('戻る', { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/groups$/);
  });

  test('[14-17] タブ切替（3タブ）', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('tabs');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id);
    await expect(page.getByTestId('admin-groups-add-user-button')).toBeVisible();
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabTemplates, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/groups/${group.id}/templates`));
    await expect(page.getByTestId('admin-groups-add-template-button')).toBeVisible();
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabAssistants, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/groups/${group.id}/assistants`));
    await expect(page.getByTestId('admin-groups-add-assistant-button')).toBeVisible();
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabUsers, { exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/groups/${group.id}/users`));
    await expect(page.getByTestId('admin-groups-add-user-button')).toBeVisible();
  });

  // ---------- 所属ユーザー ----------

  test('[14-18] 所属ユーザー一覧表示', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const [member, admin] = await usersNamed(makeUsers, prefix, ['member', 'admin']);
    const group = await makeGroup('users', { users: [{ user: member }, { user: admin, admin: true }] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(2);
    for (const header of ['ユーザー表示名', '権限', '請求期間内クレジット']) {
      await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
    }
    await expect(teamPage.row('users', `${prefix}-admin`)).toContainText(TEAM_MESSAGES.roleAdmin);
    await expect(teamPage.row('users', `${prefix}-member`)).toContainText(TEAM_MESSAGES.roleMember);
  });

  test('[14-19] ユーザー検索', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const users = await usersNamed(makeUsers, prefix, ['alpha', 'beta']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(2);
    await teamPage.search('alpha');
    await expect(teamPage.rows('users')).toHaveCount(1);
    await expect(teamPage.row('users', `${prefix}-alpha`)).toBeVisible();
  });

  test('[14-20] ユーザー検索（0件）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['alpha']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.search(`${prefix}-存在しない`);
    await expect(teamPage.rows('users')).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noUsers)).toBeVisible();
  });

  test('[14-21] 権限フィルター（すべて）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const [member, admin] = await usersNamed(makeUsers, prefix, ['member', 'admin']);
    const group = await makeGroup('users', { users: [{ user: member }, { user: admin, admin: true }] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(2);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.roleAdmin);
    await expect(teamPage.rows('users')).toHaveCount(1);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.allRoles);
    await expect(teamPage.rows('users')).toHaveCount(2);
  });

  test('[14-22] ユーザー並替（ユーザー名）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const users = await usersNamed(makeUsers, prefix, ['b', 'c', 'a']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortUserName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[14-23] ユーザー並替（権限）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['m1', 'a1', 'm2', 'a2']);
    const group = await makeGroup('users', {
      users: users.map((user, index) => ({ user, admin: index % 2 === 1 })),
    });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(4);
    // 権限ごとにまとまって並ぶ。昇順と降順では先頭の権限が入れ替わる
    const rolesOf = async () => {
      const texts = await textsOf(teamPage.rows('users'), (row) => row);
      return texts.map((text) => (text.includes(TEAM_MESSAGES.roleAdmin) ? TEAM_MESSAGES.roleAdmin : TEAM_MESSAGES.roleMember));
    };
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortRole, order: TEAM_MESSAGES.asc });
    await expect(page.getByText(`${prefix}-m1`)).toBeVisible();
    await expect(teamPage.rows('users')).toHaveCount(4);
    const asc = await rolesOf();
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(rolesOf).not.toEqual(asc);
    await expect(teamPage.rows('users')).toHaveCount(4);
    const desc = await rolesOf();
    for (const roles of [asc, desc]) {
      expect(roles.filter((role, index) => index > 0 && role !== roles[index - 1])).toHaveLength(1);
    }
    expect(desc[0]).not.toBe(asc[0]);
  });

  test('[14-24] ユーザー並替（昇順/降順）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    // 追加順 c → a → b
    const users = await usersNamed(makeUsers, prefix, ['c', 'a', 'b']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(3);
    // ユーザー表示名順
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortUserName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
    // 追加日時順
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAdded, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-c`, `${prefix}-a`, `${prefix}-b`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-b`, `${prefix}-a`, `${prefix}-c`]);
  });

  test('[14-25] ユーザーページ送り', async ({ loginAs, teamPage, makeGroup, makeUsers, adminApi, prefix }) => {
    const users = await makeUsers(TEAM_TAB_PAGE_SIZE + 1, (index) => `${prefix}-${String(index).padStart(2, '0')}`);
    const group = await makeGroup('users');
    await addGroupUsers(
      adminApi,
      group.id,
      users.map((user) => user.id),
    );
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.countDisplay).toHaveText(`1-25件 / ${TEAM_TAB_PAGE_SIZE + 1}件`);
    await expect(teamPage.rows('users')).toHaveCount(TEAM_TAB_PAGE_SIZE);
    await teamPage.topNext.click();
    await expect(teamPage.rows('users')).toHaveCount(1);
  });

  test('[14-26] ユーザー追加', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    await usersNamed(makeUsers, prefix, ['add1', 'add2', 'other']);
    const group = await makeGroup('users');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await page.getByTestId('admin-groups-add-user-button').click();
    const dialog = dialogOf(page, TEAM_MESSAGES.addUser);
    await teamPage.pickUsersInDialog(dialog, [`${prefix}-add1`, `${prefix}-add2`]);
    await confirmDialog(dialog);
    await expectSuccessToast(page, TEAM_MESSAGES.addUserSuccess);
    await expect(teamPage.rows('users')).toHaveCount(2);
    await expect(teamPage.row('users', `${prefix}-add1`)).toBeVisible();
    await expect(teamPage.row('users', `${prefix}-add2`)).toBeVisible();
  });

  test('[14-27] 権限編集', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['member']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.row('users', `${prefix}-member`).getByTestId('admin-groups-user-row-menu-button').click();
    await page.getByTestId('admin-groups-edit-role-button').click();
    const dialog = dialogOf(page, TEAM_MESSAGES.editRoleMenu);
    await dialog.getByText(TEAM_MESSAGES.roleAdmin, { exact: true }).click();
    await confirmDialog(dialog);
    await expectSuccessToast(page, TEAM_MESSAGES.editRoleSuccess);
    await expect(teamPage.row('users', `${prefix}-member`)).toContainText(TEAM_MESSAGES.roleAdmin);
  });

  test('[14-28] ユーザー削除（個別）', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['remove', 'keep']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.row('users', `${prefix}-remove`).getByTestId('admin-groups-user-row-menu-button').click();
    await page.getByTestId('admin-groups-remove-user-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.removeUserTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.removeUserSuccess);
    await expect(teamPage.rows('users')).toHaveCount(1);
    await expect(teamPage.row('users', `${prefix}-keep`)).toBeVisible();
  });

  test('[14-29] ユーザー一括選択', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['a', 'b']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.toggleRow(teamPage.row('users', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('users', `${prefix}-b`));
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.deselect, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.removeSelected, exact: true })).toBeVisible();
  });

  test('[14-30] ユーザー一括削除', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['a', 'b', 'keep']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.toggleRow(teamPage.row('users', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('users', `${prefix}-b`));
    await page.getByRole('button', { name: TEAM_MESSAGES.removeSelected, exact: true }).click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.removeUserTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.removeUserSuccess);
    await expect(teamPage.rows('users')).toHaveCount(1);
    await expect(teamPage.row('users', `${prefix}-keep`)).toBeVisible();
  });

  test('[14-31] ユーザー全選択', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const users = await usersNamed(makeUsers, prefix, ['a', 'b', 'c']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(3);
    await teamPage.selectAll.click();
    for (let i = 0; i < 3; i += 1) {
      await expect(teamPage.rows('users').nth(i).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true');
    }
  });

  test('[14-32] ユーザー選択解除', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix, page }) => {
    const users = await usersNamed(makeUsers, prefix, ['a', 'b']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await teamPage.selectAll.click();
    await page.getByRole('button', { name: TEAM_MESSAGES.deselect, exact: true }).click();
    await expect(page.getByTestId('admin-groups-add-user-button')).toBeVisible();
    for (let i = 0; i < 2; i += 1) {
      await expect(teamPage.rows('users').nth(i).getByRole('checkbox')).toHaveAttribute('aria-checked', 'false');
    }
  });

  test('[14-33] 所属ユーザー0件', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('empty');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noUsers)).toBeVisible();
  });

  // ---------- 所属テンプレート ----------

  test('[14-34] 所属テンプレート一覧表示', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    const template = await makeTemplate('t1');
    const group = await makeGroup('templates', { templates: [template] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(1);
    for (const header of ['テンプレート名', 'システムプロンプト', '更新日時']) {
      await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
    }
    await expect(teamPage.row('templates', `${prefix}-t1`)).toContainText('テスト用のシステムプロンプト');
  });

  test('[14-35] テンプレート検索', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix }) => {
    const templates = [await makeTemplate('alpha'), await makeTemplate('beta')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(2);
    await teamPage.search('alpha');
    await expect(teamPage.rows('templates')).toHaveCount(1);
    await expect(teamPage.row('templates', `${prefix}-alpha`)).toBeVisible();
  });

  test('[14-36] テンプレート検索（0件）', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    const group = await makeGroup('templates', { templates: [await makeTemplate('alpha')] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await teamPage.search(`${prefix}-存在しない`);
    await expect(teamPage.rows('templates')).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noTemplates)).toBeVisible();
  });

  test('[14-37] テンプレート並替（追加日時）', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix }) => {
    // チームへの追加順 c → a → b
    const c = await makeTemplate('c');
    const a = await makeTemplate('a');
    const b = await makeTemplate('b');
    const group = await makeGroup('templates', { templates: [c, a, b] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortTemplateUpdated, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-c`, `${prefix}-a`, `${prefix}-b`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-b`, `${prefix}-a`, `${prefix}-c`]);
  });

  test('[14-38] テンプレート並替（テンプレート名）', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix }) => {
    const templates = [await makeTemplate('c'), await makeTemplate('a'), await makeTemplate('b')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortTemplateName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[14-39] テンプレート並替（昇順/降順）', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix }) => {
    const templates = [await makeTemplate('c'), await makeTemplate('a'), await makeTemplate('b')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortTemplateName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[14-40] テンプレートページ送り', async ({ loginAs, teamPage, makeGroup, adminApi, prefix }) => {
    const created: TestTemplate[] = [];
    try {
      for (let i = 0; i <= TEAM_TAB_PAGE_SIZE; i += 1) {
        created.push(await createTemplate(adminApi, `${prefix}-p${String(i).padStart(2, '0')}`));
      }
      const group = await makeGroup('templates');
      await addGroupTemplates(
        adminApi,
        group.id,
        created.map((template) => template.id),
      );
      await loginAs('tenantAdmin');
      await teamPage.gotoTab(group.id, 'templates');
      await expect(teamPage.countDisplay).toHaveText(`1-25件 / ${TEAM_TAB_PAGE_SIZE + 1}件`);
      await expect(teamPage.rows('templates')).toHaveCount(TEAM_TAB_PAGE_SIZE);
      await teamPage.topNext.click();
      await expect(teamPage.rows('templates')).toHaveCount(1);
    } finally {
      for (const template of created) await deleteTemplate(adminApi, template.id);
    }
  });

  test('[14-41] テンプレート追加', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    await makeTemplate('addme');
    const group = await makeGroup('templates');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await page.getByTestId('admin-groups-add-template-button').click();
    const dialog = dialogOf(page, TEAM_MESSAGES.addTemplate);
    await teamPage.pickInCombobox(dialog, [`${prefix}-addme`]);
    await confirmDialog(dialog);
    await expectSuccessToast(page, TEAM_MESSAGES.addTemplateSuccess);
    await expect(teamPage.row('templates', `${prefix}-addme`)).toBeVisible();
  });

  test('[14-42] テンプレート削除（個別）', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    const templates = [await makeTemplate('remove'), await makeTemplate('keep')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await teamPage.row('templates', `${prefix}-remove`).getByTestId('admin-groups-remove-template-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteTemplateTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.deleteTemplateSuccess);
    await expect(teamPage.rows('templates')).toHaveCount(1);
    await expect(teamPage.row('templates', `${prefix}-keep`)).toBeVisible();
  });

  test('[14-43] テンプレート一括選択', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    const templates = [await makeTemplate('a'), await makeTemplate('b')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await teamPage.toggleRow(teamPage.row('templates', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('templates', `${prefix}-b`));
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.deselect, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.removeFromTeam, exact: true })).toBeVisible();
  });

  test('[14-44] テンプレート一括削除', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix, page }) => {
    const templates = [await makeTemplate('a'), await makeTemplate('b'), await makeTemplate('keep')];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await teamPage.toggleRow(teamPage.row('templates', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('templates', `${prefix}-b`));
    await page.getByRole('button', { name: TEAM_MESSAGES.removeFromTeam, exact: true }).click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteTemplateTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.deleteTemplateSuccess);
    await expect(teamPage.rows('templates')).toHaveCount(1);
    await expect(teamPage.row('templates', `${prefix}-keep`)).toBeVisible();
  });

  test('[14-45] 所属テンプレート0件', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('empty');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noTemplates)).toBeVisible();
  });

  // ---------- 所属アシスタント ----------

  test('[14-46] 所属アシスタント一覧表示', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('assistants', { assistants: [SEED.cloudGeneral.name] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    for (const header of ['アシスタント表示名', '接続サーバー', '生成AIモデル', 'カテゴリ', '履歴送信']) {
      await expect(page.getByText(header, { exact: true }).first()).toBeVisible();
    }
    const row = teamPage.row('assistants', SEED.cloudGeneral.name);
    await expect(row).toContainText(SEED.cloudGeneral.server);
    await expect(row).toContainText(SEED.cloudGeneral.category);
  });

  test('[14-47] サーバーフィルター（すべて）', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverLocal);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.allServers);
    await expect(teamPage.rows('assistants')).toHaveCount(3);
  });

  test('[14-48] サーバーフィルター（ローカル）', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverLocal);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', SEED.local.name)).toBeVisible();
  });

  test('[14-49] サーバーフィルター（クラウド汎用）', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverCloudGeneral);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', SEED.cloudGeneral.name)).toBeVisible();
  });

  test('[14-50] サーバーフィルター（クラウド指定）', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverCloudSpecified);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', SEED.cloudSpecified.name)).toBeVisible();
  });

  test('[14-51] カテゴリフィルター', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(1, SEED.local.category);
    await expect(teamPage.rows('assistants')).toHaveCount(2);
    await expect(teamPage.row('assistants', SEED.local.name)).toBeVisible();
    await expect(teamPage.row('assistants', SEED.cloudSpecified.name)).toBeVisible();
    await teamPage.chooseSelect(1, SEED.cloudGeneral.category);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', SEED.cloudGeneral.name)).toBeVisible();
  });

  test('[14-52] アシスタント並替（追加日時）', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantAdded, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-c`, `${prefix}-a`, `${prefix}-b`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-b`, `${prefix}-a`, `${prefix}-c`]);
  });

  test('[14-53] アシスタント並替（表示名）', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[14-54] アシスタント並替（サーバー）', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    // 接続サーバーの種別の文字列順（SAAS_CHAT < SAAS_RAG < SECURE）= クラウド(一般) → クラウド(学習先指定) → ローカル
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantServer, order: TEAM_MESSAGES.asc });
    await expect
      .poll(() => teamPage.rowNames('assistants'))
      .toEqual([SEED.cloudGeneral.name, SEED.cloudSpecified.name, SEED.local.name]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect
      .poll(() => teamPage.rowNames('assistants'))
      .toEqual([SEED.local.name, SEED.cloudSpecified.name, SEED.cloudGeneral.name]);
  });

  test('[14-55] アシスタント並替（カテゴリ）', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix }) => {
    // 追加順 c, a, b に、カテゴリ名を c → x, a → z, b → y として付ける（カテゴリ名の昇順 = x(c), y(b), z(a)）
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup, { c: 'x', a: 'z', b: 'y' });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantCategory, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[14-56] アシスタント並替（昇順/降順）', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    await teamPage.chooseSort({ order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[14-57] アシスタントページ送り', async ({ loginAs, teamPage, makeGroup, adminApi, prefix }) => {
    const created: TestAssistant[] = [];
    try {
      const names = Array.from(
        { length: TEAM_TAB_PAGE_SIZE + 1 },
        (_, index) => `${prefix}-a${String(index).padStart(2, '0')}`,
      );
      created.push(...(await Promise.all(names.map((name) => createAssistant(adminApi, name)))));
      const group = await makeGroup('assistants');
      await addGroupAssistants(
        adminApi,
        group.id,
        created.map((assistant) => assistant.id),
      );
      await loginAs('tenantAdmin');
      await teamPage.gotoTab(group.id, 'assistants');
      await expect(teamPage.countDisplay).toHaveText(`1-25件 / ${TEAM_TAB_PAGE_SIZE + 1}件`);
      await expect(teamPage.rows('assistants')).toHaveCount(TEAM_TAB_PAGE_SIZE);
      await teamPage.topNext.click();
      await expect(teamPage.rows('assistants')).toHaveCount(1);
    } finally {
      for (const assistant of created) await deleteAssistant(adminApi, assistant.id);
    }
  });

  test('[14-58] アシスタント追加', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix, page }) => {
    await makeAssistant('addme');
    const group = await makeGroup('assistants');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await page.getByTestId('admin-groups-add-assistant-button').click();
    const dialog = dialogOf(page, TEAM_MESSAGES.addAssistant);
    await teamPage.pickInCombobox(dialog, [`${prefix}-addme`]);
    await confirmDialog(dialog);
    await expectSuccessToast(page, TEAM_MESSAGES.addAssistantSuccess);
    await expect(teamPage.row('assistants', `${prefix}-addme`)).toBeVisible();
  });

  test('[14-59] アシスタント削除（個別）', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix, page }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await teamPage.row('assistants', `${prefix}-a`).getByTestId('admin-groups-remove-assistant-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteAssistantTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.deleteAssistantSuccess);
    await expect(teamPage.rows('assistants')).toHaveCount(2);
    await expect(teamPage.row('assistants', `${prefix}-a`)).toHaveCount(0);
  });

  test('[14-60] アシスタント一括選択', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix, page }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await teamPage.toggleRow(teamPage.row('assistants', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('assistants', `${prefix}-b`));
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.deselect, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: TEAM_MESSAGES.removeFromTeam, exact: true })).toBeVisible();
  });

  test('[14-61] アシスタント一括削除', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix, page }) => {
    const group = await makeNamedAssistantTeam(makeAssistant, makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await teamPage.toggleRow(teamPage.row('assistants', `${prefix}-a`));
    await teamPage.toggleRow(teamPage.row('assistants', `${prefix}-b`));
    await page.getByRole('button', { name: TEAM_MESSAGES.removeFromTeam, exact: true }).click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteAssistantTitle));
    await expectSuccessToast(page, TEAM_MESSAGES.deleteAssistantSuccess);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', `${prefix}-c`)).toBeVisible();
  });

  test('[14-62] 所属アシスタント0件', async ({ loginAs, teamPage, makeGroup, page }) => {
    const group = await makeGroup('empty');
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(0);
    await expect(page.getByText(TEAM_MESSAGES.noAssistants)).toBeVisible();
  });

  // ---------- 組み合わせ・その他 ----------

  test('[14-63] ユーザー：検索＋権限フィルター', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const [ax, ay, bx] = await usersNamed(makeUsers, prefix, ['ax', 'ay', 'bx']);
    const group = await makeGroup('users', {
      users: [{ user: ax, admin: true }, { user: ay }, { user: bx, admin: true }],
    });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(3);
    await teamPage.search(`${prefix}-a`);
    await expect(teamPage.rows('users')).toHaveCount(2);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.roleAdmin);
    await expect(teamPage.rows('users')).toHaveCount(1);
    await expect(teamPage.row('users', `${prefix}-ax`)).toBeVisible();
  });

  test('[14-64] ユーザー：検索＋並べ替え', async ({ loginAs, teamPage, makeGroup, makeUsers, prefix }) => {
    const users = await usersNamed(makeUsers, prefix, ['a1', 'a3', 'a2', 'b1']);
    const group = await makeGroup('users', { users: users.map((user) => ({ user })) });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(4);
    await teamPage.search(`${prefix}-a`);
    await expect(teamPage.rows('users')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortUserName, order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('users')).toEqual([`${prefix}-a3`, `${prefix}-a2`, `${prefix}-a1`]);
  });

  test('[14-65] テンプレート：検索＋並べ替え', async ({ loginAs, teamPage, makeGroup, makeTemplate, prefix }) => {
    const templates = [
      await makeTemplate('a1'),
      await makeTemplate('a3'),
      await makeTemplate('a2'),
      await makeTemplate('b1'),
    ];
    const group = await makeGroup('templates', { templates });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'templates');
    await expect(teamPage.rows('templates')).toHaveCount(4);
    await teamPage.search(`${prefix}-a`);
    await expect(teamPage.rows('templates')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortTemplateName, order: TEAM_MESSAGES.desc });
    await expect.poll(() => teamPage.rowNames('templates')).toEqual([`${prefix}-a3`, `${prefix}-a2`, `${prefix}-a1`]);
  });

  test('[14-66] アシスタント：サーバー＋カテゴリフィルター', async ({ loginAs, teamPage, makeGroup }) => {
    const group = await makeServerMixTeam(makeGroup);
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverCloudSpecified);
    await teamPage.chooseSelect(1, SEED.cloudSpecified.category);
    await expect(teamPage.rows('assistants')).toHaveCount(1);
    await expect(teamPage.row('assistants', SEED.cloudSpecified.name)).toBeVisible();
  });

  test('[14-67] アシスタント：フィルター＋並べ替え', async ({ loginAs, teamPage, makeGroup, makeAssistant, prefix }) => {
    // クラウド(一般)の 3 件 + ローカル 1 件。サーバーフィルター（クラウド(一般)）をかけてから、各項目で並べ替える
    const ids: string[] = [];
    for (const [suffix, category] of [['c', 'x'], ['a', 'z'], ['b', 'y']] as const) {
      ids.push((await makeAssistant(suffix, [category])).id);
    }
    const group = await makeGroup('assistants', { assistants: [...ids, SEED.local.name] });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'assistants');
    await expect(teamPage.rows('assistants')).toHaveCount(4);
    await teamPage.chooseSelect(0, TEAM_MESSAGES.serverCloudGeneral);
    await expect(teamPage.rows('assistants')).toHaveCount(3);

    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantName, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
    // サーバーが同じなので順序は問わず、3 件が表示されたまま（エラーにならない）こと
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantServer, order: TEAM_MESSAGES.asc });
    await expect(teamPage.rows('assistants')).toHaveCount(3);
    await teamPage.chooseSort({ field: TEAM_MESSAGES.sortAssistantCategory, order: TEAM_MESSAGES.asc });
    await expect.poll(() => teamPage.rowNames('assistants')).toEqual([`${prefix}-c`, `${prefix}-b`, `${prefix}-a`]);
  });

  test('[14-68] 3タブ連続CRUD', async ({
    loginAs,
    teamPage,
    makeGroup,
    makeUsers,
    makeTemplate,
    makeAssistant,
    prefix,
    page,
  }) => {
    await usersNamed(makeUsers, prefix, ['crud']);
    await makeTemplate('crud');
    await makeAssistant('crud');
    const group = await makeGroup('crud');
    await loginAs('tenantAdmin');

    // 所属ユーザー: 追加 → 確認 → 削除
    await teamPage.gotoTab(group.id, 'users');
    await page.getByTestId('admin-groups-add-user-button').click();
    const userDialog = dialogOf(page, TEAM_MESSAGES.addUser);
    await teamPage.pickUsersInDialog(userDialog, [`${prefix}-crud`]);
    await confirmDialog(userDialog);
    await expectSuccessToast(page, TEAM_MESSAGES.addUserSuccess);
    await expect(teamPage.row('users', `${prefix}-crud`)).toBeVisible();
    await teamPage.row('users', `${prefix}-crud`).getByTestId('admin-groups-user-row-menu-button').click();
    await page.getByTestId('admin-groups-remove-user-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.removeUserTitle));
    await expect(teamPage.rows('users')).toHaveCount(0);

    // 所属テンプレート
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabTemplates, { exact: true }).click();
    await page.getByTestId('admin-groups-add-template-button').click();
    const templateDialog = dialogOf(page, TEAM_MESSAGES.addTemplate);
    await teamPage.pickInCombobox(templateDialog, [`${prefix}-crud`]);
    await confirmDialog(templateDialog);
    await expect(teamPage.row('templates', `${prefix}-crud`)).toBeVisible();
    await teamPage.row('templates', `${prefix}-crud`).getByTestId('admin-groups-remove-template-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteTemplateTitle));
    await expect(teamPage.rows('templates')).toHaveCount(0);

    // 所属アシスタント
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabAssistants, { exact: true }).click();
    await page.getByTestId('admin-groups-add-assistant-button').click();
    const assistantDialog = dialogOf(page, TEAM_MESSAGES.addAssistant);
    await teamPage.pickInCombobox(assistantDialog, [`${prefix}-crud`]);
    await confirmDialog(assistantDialog);
    await expect(teamPage.row('assistants', `${prefix}-crud`)).toBeVisible();
    await teamPage.row('assistants', `${prefix}-crud`).getByTestId('admin-groups-remove-assistant-button').click();
    await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteAssistantTitle));
    await expect(teamPage.rows('assistants')).toHaveCount(0);
  });

  test('[14-69] チーム名最大長', async ({ loginAs, teamPage, page, prefix, adminApi }) => {
    const name = `${prefix}-${'あ'.repeat(TEAM_NAME_MAX_LENGTH)}`.slice(0, TEAM_NAME_MAX_LENGTH);
    expect(name).toHaveLength(TEAM_NAME_MAX_LENGTH);
    await loginAs('tenantAdmin');
    await teamPage.gotoList();
    try {
      const dialog = await teamPage.openCreateDialog();
      await dialog.getByTestId('admin-groups-name-input').fill(name);
      await confirmDialog(dialog);
      await expectSuccessToast(page, TEAM_MESSAGES.createSuccess);
      await teamPage.search(prefix);
      await expect(teamPage.card(name)).toBeVisible();
    } finally {
      await deleteGroupsByPrefix(adminApi, prefix);
    }
  });

  test('[14-70] 検索1件ヒット', async ({
    loginAs,
    teamPage,
    makeGroup,
    makeUsers,
    makeTemplate,
    makeAssistant,
    prefix,
  }) => {
    // 3 つのタブで、それぞれ 2 件のうち 1 件だけにヒットする語で検索する
    const users = await usersNamed(makeUsers, prefix, ['u-hit', 'u-miss']);
    const templates = [await makeTemplate('t-hit'), await makeTemplate('t-miss')];
    const assistants = [await makeAssistant('a-hit'), await makeAssistant('a-miss')];
    const group = await makeGroup('search', {
      users: users.map((user) => ({ user })),
      templates,
      assistants: assistants.map((assistant) => assistant.id),
    });
    await loginAs('tenantAdmin');
    await teamPage.gotoTab(group.id, 'users');
    await expect(teamPage.rows('users')).toHaveCount(2);
    await teamPage.search('u-hit');
    await expect(teamPage.rows('users')).toHaveCount(1);
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabTemplates, { exact: true }).click();
    await expect(teamPage.rows('templates')).toHaveCount(2);
    await teamPage.search('t-hit');
    await expect(teamPage.rows('templates')).toHaveCount(1);
    await teamPage.tablist.getByText(TEAM_MESSAGES.tabAssistants, { exact: true }).click();
    await expect(teamPage.rows('assistants')).toHaveCount(2);
    await teamPage.search('a-hit');
    await expect(teamPage.rows('assistants')).toHaveCount(1);
  });

  test('[14-71] チーム管理 Chrome', async ({ loginAs, teamPage, page, prefix, adminApi }) => {
    await loginAs('tenantAdmin');
    await teamPage.openFromSidebar();
    try {
      const dialog = await teamPage.openCreateDialog();
      await dialog.getByTestId('admin-groups-name-input').fill(`${prefix}-chrome`);
      await confirmDialog(dialog);
      await expectSuccessToast(page, TEAM_MESSAGES.createSuccess);
      await teamPage.search(prefix);
      await teamPage.card(`${prefix}-chrome`).getByTestId('admin-groups-view-edit-button').click();
      for (const label of [TEAM_MESSAGES.tabTemplates, TEAM_MESSAGES.tabAssistants, TEAM_MESSAGES.tabUsers]) {
        await teamPage.tablist.getByText(label, { exact: true }).click();
      }
      await teamPage.detailMenu('admin-groups-edit-name-button');
      const edit = dialogOf(page, TEAM_MESSAGES.editTitle);
      await edit.getByTestId('admin-groups-name-input').fill(`${prefix}-chrome2`);
      await confirmDialog(edit);
      await expectSuccessToast(page, TEAM_MESSAGES.updateSuccess);
      await teamPage.detailMenu('admin-groups-delete-button');
      await confirmDialog(dialogOf(page, TEAM_MESSAGES.deleteMenu));
      await expect(page).toHaveURL(/\/admin\/groups$/);
    } finally {
      await deleteGroupsByPrefix(adminApi, prefix);
    }
  });
});

/** 3 種類の接続サーバー（クラウド(一般)・ローカル・クラウド(学習先指定)）のアシスタントが 1 件ずつ入ったチーム。 */
async function makeServerMixTeam(makeGroup: TeamFixtures['makeGroup']): Promise<TestGroup> {
  return makeGroup('servers', { assistants: [SEED.cloudGeneral.name, SEED.local.name, SEED.cloudSpecified.name] });
}

/**
 * 名前だけが違うクラウド(一般)のアシスタント 3 つ（追加順 c → a → b）が入ったチームを作る。
 *
 * @param makeAssistant makeAssistant fixture
 * @param makeGroup makeGroup fixture
 * @param categories アシスタントの末尾（c・a・b）→ 付けるカテゴリ名の末尾。省略するとカテゴリなし
 * @returns 作ったチーム
 */
async function makeNamedAssistantTeam(
  makeAssistant: TeamFixtures['makeAssistant'],
  makeGroup: TeamFixtures['makeGroup'],
  categories?: Record<string, string>,
): Promise<TestGroup> {
  const ids: string[] = [];
  for (const suffix of ['c', 'a', 'b']) {
    const assistant = await makeAssistant(suffix, categories ? [categories[suffix]] : []);
    ids.push(assistant.id);
  }
  // makeGroup は、名前に一致する seed のアシスタントがなければ、渡された値をそのまま ID として使う
  return makeGroup('assistants', { assistants: ids });
}
