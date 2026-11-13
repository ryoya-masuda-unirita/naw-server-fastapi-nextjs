import type { APIRequestContext } from '@playwright/test';
import { loginApi, createUser, deleteUser, type CreatedUser } from '../src/api.ts';
import {
  createLibrary,
  createLibraryTag,
  deleteLibrary,
  deleteLibraryTags,
  deleteLibraryTagsByPrefix,
  type TestLibrary,
  type TestLibraryTag,
} from '../src/api-library.ts';
import { addGroupUsers, createGroup, deleteGroup } from '../src/api-team.ts';
import { expect, test as base } from '../src/fixtures.ts';
import {
  COMMON_MESSAGES,
  confirmDialog,
  dialogOf,
  expectErrorToast,
} from '../src/pages/admin-widgets.ts';
import { LIBRARY_MESSAGES, LIBRARY_PAGE_SIZE, LibraryPage } from '../src/pages/library.page.ts';
import { TENANT_ID } from '../src/users.ts';

/**
 * 09_ライブラリ（41 項目）。項目書: 25DA61_結合テスト項目書_md/09_ライブラリ.md
 *
 * 移植元との対応:
 * - ライブラリはチャットの回答から作る機能。テストのライブラリは API（メッセージ → ライブラリ）で用意し、画面では一覧・編集・削除を操作する
 * - 項目書のメニュー文言（「設定を編集」「リンクをコピー」「削除」）は、画面の実際の文言
 *   （「コンテンツの設定を編集」「共有リンクをコピー」「ライブラリから削除」。移植元の ja.json と同じ）に読み替える
 * - 項番 6 の「テスト方法」は一般ユーザーと書かれているが、確認内容（タグ管理が表示される）から管理者で確かめる
 * - Chrome の項目（40・41）は、このテストの実行ブラウザ（Chromium）で一般・管理者の主要操作を通す
 */

/** admin の users.id（seed.sql）。他ユーザーのライブラリを共有されるチームに入れる。 */
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
/** 1 ページに収まらない件数（ページ送りの確認用）。 */
const MIN_RESULTS_FOR_PAGING = LIBRARY_PAGE_SIZE + 1;

interface LibraryFixtures {
  /** このテスト専用の接頭辞。検索語にすると自分のライブラリだけに絞れる。 */
  prefix: string;
  /** 管理者のライブラリを作る（終了時に自動削除）。 */
  makeLibrary: (suffix: string, options?: { tagIds?: string[] }) => Promise<TestLibrary>;
  /** ライブラリのタグを作る（終了時に自動削除）。 */
  makeTag: (suffix: string) => Promise<TestLibraryTag>;
  libraryPage: LibraryPage;
}

const test = base.extend<LibraryFixtures>({
  prefix: async ({ uniqueId }, use) => {
    await use(uniqueId('lib'));
  },

  libraryPage: async ({ page }, use) => {
    await use(new LibraryPage(page));
  },

  makeLibrary: async ({ adminApi, prefix }, use) => {
    const created: TestLibrary[] = [];
    await use(async (suffix, options) => {
      const library = await createLibrary(adminApi, { title: `${prefix}-${suffix}`, tagIds: options?.tagIds });
      created.push(library);
      return library;
    });
    for (const library of created) await deleteLibrary(adminApi, library);
  },

  makeTag: async ({ adminApi, prefix }, use) => {
    const created: TestLibraryTag[] = [];
    await use(async (suffix) => {
      const tag = await createLibraryTag(adminApi, `${prefix}-${suffix}`);
      created.push(tag);
      return tag;
    });
    await deleteLibraryTags(
      adminApi,
      created.map((tag) => tag.id),
    );
    await deleteLibraryTagsByPrefix(adminApi, prefix);
  },
});

test.describe('09_ライブラリ', () => {
  test('[09-01] 一覧表示（一般ユーザー）', async ({ loginAs, libraryPage }) => {
    await loginAs('user');
    await libraryPage.openFromSidebar();
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tablist).toHaveCount(0);
  });

  test('[09-02] 一覧表示（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.openFromSidebar();
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tablist.getByText(LIBRARY_MESSAGES.tabContents, { exact: true })).toBeVisible();
    await expect(libraryPage.tablist.getByText(LIBRARY_MESSAGES.tabTags, { exact: true })).toBeVisible();
  });

  test('[09-03] タブ非表示（一般ユーザー）', async ({ loginAs, libraryPage, page }) => {
    await loginAs('user');
    await libraryPage.goto();
    await expect(page.getByText(LIBRARY_MESSAGES.tabContents, { exact: true })).toHaveCount(0);
    await expect(page.getByText(LIBRARY_MESSAGES.tabTags, { exact: true })).toHaveCount(0);
    await libraryPage.expectContentsVisible();
  });

  test('[09-04] タブ表示（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await expect(libraryPage.tablist.getByText(LIBRARY_MESSAGES.tabContents, { exact: true })).toBeVisible();
    await expect(libraryPage.tablist.getByText(LIBRARY_MESSAGES.tabTags, { exact: true })).toBeVisible();
  });

  test('[09-05] タグ管理直接表示（一般ユーザー）', async ({ loginAs, libraryPage }) => {
    await loginAs('user');
    await libraryPage.goto('?tab=tags');
    // タグ管理は出ず、コンテンツ一覧だけが出る
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tagAddButton).toHaveCount(0);
  });

  test('[09-06] タグ管理直接表示（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    await libraryPage.expectTagsVisible();
    await expect(libraryPage.searchInput).toHaveCount(0);
  });

  test('[09-07] キーワード検索', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    const apple = await makeLibrary('apple');
    await makeLibrary('banana');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await expect(libraryPage.rows).toHaveCount(2);
    await libraryPage.search(`${prefix}-apple`);
    await expect(libraryPage.rows).toHaveCount(1);
    await expect(libraryPage.row(apple.title)).toBeVisible();
  });

  test('[09-08] ユーザーフィルター', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    const mine = await makeLibrary('mine');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await expect(libraryPage.row(mine.title)).toBeVisible();

    // 自分のみ: 自分のライブラリが出る / 他ユーザーのみ: 自分のライブラリは出ない
    await libraryPage.chooseUserFilter(LIBRARY_MESSAGES.onlyMine);
    await expect(libraryPage.row(mine.title)).toBeVisible();
    await libraryPage.chooseUserFilter(LIBRARY_MESSAGES.onlyOthers);
    await expect(libraryPage.rows).toHaveCount(0);
  });

  test('[09-09] タグフィルター', async ({ loginAs, libraryPage, makeLibrary, makeTag }) => {
    const tag = await makeTag('tag');
    const tagged = await makeLibrary('tagged', { tagIds: [tag.id] });
    const plain = await makeLibrary('plain');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(tagged.title.split('-tagged')[0]);
    await expect(libraryPage.row(plain.title)).toBeVisible();
    await libraryPage.chooseTagFilter(tag.name);
    await expect(libraryPage.rows).toHaveCount(1);
    await expect(libraryPage.row(tagged.title)).toBeVisible();
  });

  test('[09-10] 並べ替え', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    // 作った順（更新日時順）と名前順が逆になるように作る
    await makeLibrary('c');
    await makeLibrary('a');
    await makeLibrary('b');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await expect(libraryPage.rows).toHaveCount(3);
    expect(await libraryPage.titles()).toEqual([`${prefix}-b`, `${prefix}-a`, `${prefix}-c`]);

    await libraryPage.chooseSort({ field: LIBRARY_MESSAGES.sortTitle, order: COMMON_MESSAGES.asc });
    await expect(libraryPage.rows.first()).toContainText(`${prefix}-a`);
    expect(await libraryPage.titles()).toEqual([`${prefix}-a`, `${prefix}-b`, `${prefix}-c`]);
  });

  test('[09-11] ページ送り', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    for (let i = 1; i <= MIN_RESULTS_FOR_PAGING; i += 1) await makeLibrary(`p${i}`);
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    // 検索（300ms のデバウンス）が反映されて 6 件に絞られてから次のページへ進む
    await expect(libraryPage.countDisplay).toHaveText(`1-5件 / ${MIN_RESULTS_FOR_PAGING}件`);
    await expect(libraryPage.rows).toHaveCount(LIBRARY_PAGE_SIZE);
    await libraryPage.nextPage();
    await expect(libraryPage.rows).toHaveCount(1);
    await expect(libraryPage.countDisplay).toHaveText(`6-6件 / ${MIN_RESULTS_FOR_PAGING}件`);
  });

  test('[09-12] 件数表示', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    await makeLibrary('n1');
    await makeLibrary('n2');
    await makeLibrary('n3');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await expect(libraryPage.countDisplay).toHaveText('1-3件 / 3件');
  });

  test('[09-13] 詳細画面遷移', async ({ loginAs, libraryPage, makeLibrary, page, prefix }) => {
    const library = await makeLibrary('detail');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.row(library.title).getByTestId(`library-detail-${library.id}`).click();
    await expect(page).toHaveURL(new RegExp(`/library/${library.id}$`));
  });

  test('[09-14] 戻るサイドバー', async ({ loginAs, libraryPage, makeLibrary, page }) => {
    const library = await makeLibrary('back');
    await loginAs('tenantAdmin');
    await page.goto(`/library/${library.id}`);
    await expect(page.getByRole('button', { name: LIBRARY_MESSAGES.back })).toBeVisible();
    await expect(libraryPage.tablist).toHaveCount(0);
  });

  test('[09-15] 設定編集', async ({ loginAs, libraryPage, makeLibrary, makeTag, page, prefix }) => {
    const library = await makeLibrary('before');
    const tag = await makeTag('edited-tag');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuEdit);

    const dialog = libraryPage.editDialog();
    await expect(dialog).toBeVisible();
    const renamed = `${prefix}-after`;
    await dialog.getByRole('textbox').first().fill(renamed);
    // 設定するタグ: 1 つ目の MultiSelect を開き、タグを選んで「決定」
    await dialog.locator('.app-multi-select').first().locator('[aria-haspopup="listbox"]').click();
    await dialog.getByRole('option', { name: tag.name, exact: true }).click();
    await dialog.getByRole('button', { name: '決定' }).click();
    await dialog.getByRole('button', { name: COMMON_MESSAGES.save, exact: true }).click();

    await expect(dialog).toHaveCount(0);
    await libraryPage.search(renamed);
    await expect(libraryPage.rows).toHaveCount(1);
    await expect(libraryPage.row(renamed)).toContainText(tag.name);
    await expect(page.getByText(library.title, { exact: true })).toHaveCount(0);
  });

  test('[09-16] リンクコピー', async ({ loginAs, libraryPage, makeLibrary, context, page, prefix }) => {
    const library = await makeLibrary('copy');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuCopyLink);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`${new URL(page.url()).origin}/library/${library.id}`);
  });

  test('[09-17] 削除', async ({ loginAs, libraryPage, makeLibrary, page, prefix }) => {
    const library = await makeLibrary('delete');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuDelete);
    const dialog = dialogOf(page, LIBRARY_MESSAGES.deleteDialogTitle);
    await expect(dialog).toBeVisible();
    await confirmDialog(dialog);
    await expect(libraryPage.row(library.title)).toHaveCount(0);
  });

  test('[09-18] 空状態表示', async ({ loginAs, libraryPage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(`${prefix}-none`);
    await expect(libraryPage.rows).toHaveCount(0);
    await expect(page.getByTestId('table-desktop').getByText(COMMON_MESSAGES.noData)).toBeVisible();
  });

  test('[09-19] コンテンツ一覧タブ切替（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabContents);
    await libraryPage.expectContentsVisible();
  });

  test('[09-20] タグ管理タブ切替（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabTags);
    await libraryPage.expectTagsVisible();
  });

  test('[09-21] タブ間切替（管理者）', async ({ loginAs, libraryPage }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabTags);
    await libraryPage.expectTagsVisible();
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabContents);
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tagAddButton).toHaveCount(0);
  });

  test('[09-22] タグ追加（管理者）', async ({ loginAs, libraryPage, adminApi, page, prefix }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    const name = `${prefix}-new-tag`;
    try {
      await libraryPage.tagAddButton.click();
      const dialog = dialogOf(page, LIBRARY_MESSAGES.tagAdd);
      await dialog.getByRole('textbox').first().fill(name);
      await dialog.getByRole('button', { name: COMMON_MESSAGES.create, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(libraryPage.tagRow(name)).toBeVisible();
    } finally {
      await deleteLibraryTagsByPrefix(adminApi, prefix);
    }
  });

  test('[09-23] タグ編集（管理者）', async ({ loginAs, libraryPage, makeTag, page, prefix }) => {
    const tag = await makeTag('edit');
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    await libraryPage.tagRowMenu(tag.name, LIBRARY_MESSAGES.tagMenuEdit);
    const dialog = dialogOf(page, LIBRARY_MESSAGES.tagEditTitle);
    const renamed = `${prefix}-renamed`;
    await dialog.getByRole('textbox').first().fill(renamed);
    await dialog.getByRole('button', { name: COMMON_MESSAGES.save, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(libraryPage.tagRow(renamed)).toBeVisible();
    await expect(libraryPage.tagRow(tag.name)).toHaveCount(0);
  });

  test('[09-24] タグ削除（管理者）', async ({ loginAs, libraryPage, makeTag, page }) => {
    const tag = await makeTag('delete');
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    await libraryPage.tagRowMenu(tag.name, LIBRARY_MESSAGES.tagMenuDelete);
    const dialog = dialogOf(page, LIBRARY_MESSAGES.tagDeleteTitle);
    await confirmDialog(dialog);
    await expect(libraryPage.tagRow(tag.name)).toHaveCount(0);
  });

  test('[09-25] タグ管理タブ非表示（一般ユーザー）', async ({ loginAs, libraryPage, page }) => {
    await loginAs('user');
    await libraryPage.goto();
    await expect(page.getByText(LIBRARY_MESSAGES.tabTags, { exact: true })).toHaveCount(0);
    // タグ管理の URL を直接開いても、タグ管理には遷移できない
    await libraryPage.goto('?tab=tags');
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tagAddButton).toHaveCount(0);
  });

  test.describe('検索・フィルター・並べ替えの組み合わせ', () => {
    // 4 件のライブラリを共有して読むだけ（並列に流しても影響しない）。
    // 作成順を c → a → d → b にして、更新日時順（新しい順）= b, d, a, c / 名前順（昇順）= a, b, c, d と食い違わせる
    const data: {
      prefix: string;
      admin?: APIRequestContext;
      other?: APIRequestContext;
      tag?: TestLibraryTag;
      groupId?: string;
      otherUser?: CreatedUser;
      libraries: TestLibrary[];
      titles: Record<'a' | 'b' | 'c' | 'd', string>;
    } = {
      prefix: `combo-${Math.random().toString(36).slice(2, 8)}`,
      libraries: [],
      titles: { a: '', b: '', c: '', d: '' },
    };

    test.beforeAll(async () => {
      const admin = await loginApi({ tenantId: TENANT_ID, loginId: 'admin', password: 'admin@1234' });
      data.admin = admin;
      data.tag = await createLibraryTag(admin, `${data.prefix}-tag`);
      const otherUser = await createUser(admin, { loginId: `${data.prefix}-o`, name: `${data.prefix}-o` });
      data.otherUser = otherUser;
      const group = await createGroup(admin, `${data.prefix}-g`);
      data.groupId = group.id;
      await addGroupUsers(admin, group.id, [ADMIN_USER_ID, otherUser.id]);
      const other = await loginApi(otherUser);
      data.other = other;

      const t = data.prefix;
      data.titles = { a: `${t}-a-mine-tag`, b: `${t}-b-mine-plain`, c: `${t}-c-other-tag`, d: `${t}-d-other-plain` };
      const make = async (api: APIRequestContext, title: string, tagged: boolean, shared: boolean) => {
        const library = await createLibrary(api, {
          title,
          tagIds: tagged && data.tag ? [data.tag.id] : [],
          groupIds: shared ? [group.id] : [],
        });
        data.libraries.push(library);
        return library;
      };
      // 作成順 c → a → d → b
      await make(other, data.titles.c, true, true);
      await make(admin, data.titles.a, true, false);
      await make(other, data.titles.d, false, true);
      await make(admin, data.titles.b, false, false);
    });

    test.afterAll(async () => {
      const { admin, other } = data;
      if (admin) {
        for (const library of data.libraries) {
          // 他ユーザーのライブラリは作成者でしか消せない
          await deleteLibrary(other ?? admin, library).catch(() => deleteLibrary(admin, library));
        }
        if (data.tag) await deleteLibraryTags(admin, [data.tag.id]);
        if (data.groupId) await deleteGroup(admin, data.groupId);
        if (data.otherUser) await deleteUser(admin, data.otherUser);
        await admin.dispose();
      }
      await other?.dispose();
    });

    const SEARCHED_ORDER = {
      updatedAt: ['b', 'd', 'a', 'c'],
      title: ['a', 'b', 'c', 'd'],
    } as const;

    type Filter = 'none' | 'user' | 'tag' | 'both';
    type SortKey = keyof typeof SEARCHED_ORDER;

    // フィルターごとに残るライブラリ（a: 自分・タグ付き / b: 自分 / c: 他人・タグ付き / d: 他人）
    const REMAINING: Record<Filter, ('a' | 'b' | 'c' | 'd')[]> = {
      none: ['a', 'b', 'c', 'd'],
      user: ['c', 'd'],
      tag: ['a', 'c'],
      both: ['c'],
    };

    async function runCombo(
      { loginAs, libraryPage }: { loginAs: (role: 'tenantAdmin') => Promise<unknown>; libraryPage: LibraryPage },
      filter: Filter,
      sortKey: SortKey,
    ): Promise<void> {
      await loginAs('tenantAdmin');
      await libraryPage.goto();
      await libraryPage.search(data.prefix);
      await expect(libraryPage.rows).toHaveCount(4);
      if (filter === 'user' || filter === 'both') await libraryPage.chooseUserFilter(LIBRARY_MESSAGES.onlyOthers);
      if (filter === 'tag' || filter === 'both') await libraryPage.chooseTagFilter(data.tag?.name ?? '');
      if (sortKey === 'title') {
        await libraryPage.chooseSort({ field: LIBRARY_MESSAGES.sortTitle, order: COMMON_MESSAGES.asc });
      } else {
        await libraryPage.chooseSort({ field: LIBRARY_MESSAGES.sortUpdatedAt, order: COMMON_MESSAGES.desc });
      }
      const expected = SEARCHED_ORDER[sortKey]
        .filter((key) => REMAINING[filter].includes(key))
        .map((key) => data.titles[key]);
      await expect(libraryPage.rows).toHaveCount(expected.length);
      expect(await libraryPage.titles()).toEqual(expected);
    }

    test('[09-26] 検索フィルター並替-フィルターなし-更新日時順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'none', 'updatedAt');
    });

    test('[09-27] 検索フィルター並替-フィルターなし-名前順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'none', 'title');
    });

    test('[09-28] 検索フィルター並替-ユーザーフィルター-更新日時順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'user', 'updatedAt');
    });

    test('[09-29] 検索フィルター並替-ユーザーフィルター-名前順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'user', 'title');
    });

    test('[09-30] 検索フィルター並替-タグフィルター-更新日時順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'tag', 'updatedAt');
    });

    test('[09-31] 検索フィルター並替-タグフィルター-名前順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'tag', 'title');
    });

    test('[09-32] 検索フィルター並替-両方-更新日時順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'both', 'updatedAt');
    });

    test('[09-33] 検索フィルター並替-両方-名前順', async ({ loginAs, libraryPage }) => {
      await runCombo({ loginAs, libraryPage }, 'both', 'title');
    });
  });

  test('[09-34] 管理者：コンテンツ操作後タグ管理', async ({ loginAs, libraryPage, makeLibrary, makeTag, prefix }) => {
    const tag = await makeTag('after-edit');
    const library = await makeLibrary('ops');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuEdit);
    const dialog = libraryPage.editDialog();
    await cancelDialogByButton(dialog);
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabTags);
    await libraryPage.expectTagsVisible();
    await expect(libraryPage.tagRow(tag.name)).toBeVisible();
  });

  test('[09-35] 検索0件', async ({ loginAs, libraryPage, page, prefix }) => {
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(`${prefix}-存在しない`);
    await expect(libraryPage.rows).toHaveCount(0);
    await expect(libraryPage.countDisplay).toHaveText('0件');
    await expect(page.getByTestId('table-desktop').getByText(COMMON_MESSAGES.noData)).toBeVisible();
  });

  test('[09-36] 検索1件', async ({ loginAs, libraryPage, makeLibrary, prefix }) => {
    await makeLibrary('only');
    await makeLibrary('other');
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(`${prefix}-only`);
    await expect(libraryPage.rows).toHaveCount(1);
    await expect(libraryPage.countDisplay).toHaveText('1-1件 / 1件');
  });

  test('[09-37] 削除失敗', async ({ loginAs, libraryPage, makeLibrary, page, prefix }) => {
    const library = await makeLibrary('delete-fail');
    // 削除 API だけをエラーにする
    await page.route('**/api/libraries/*', (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
        : route.fallback(),
    );
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuDelete);
    await confirmDialog(dialogOf(page, LIBRARY_MESSAGES.deleteDialogTitle));
    await expectErrorToast(page, LIBRARY_MESSAGES.deleteFailed);
    await expect(libraryPage.row(library.title)).toBeVisible();
  });

  test('[09-38] 保存失敗', async ({ loginAs, libraryPage, makeLibrary, page, prefix }) => {
    const library = await makeLibrary('save-fail');
    await page.route('**/api/libraries/*', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
        : route.fallback(),
    );
    await loginAs('tenantAdmin');
    await libraryPage.goto();
    await libraryPage.search(prefix);
    await libraryPage.rowMenu(library.title, LIBRARY_MESSAGES.menuEdit);
    const dialog = libraryPage.editDialog();
    await dialog.getByRole('textbox').first().fill(`${prefix}-changed`);
    await dialog.getByRole('button', { name: COMMON_MESSAGES.save, exact: true }).click();
    await expectErrorToast(page, LIBRARY_MESSAGES.updateFailed);
  });

  test('[09-39] タグ追加失敗（管理者）', async ({ loginAs, libraryPage, page, prefix }) => {
    await page.route('**/api/admin/library-tags', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' })
        : route.fallback(),
    );
    await loginAs('tenantAdmin');
    await libraryPage.goto('?tab=tags');
    await libraryPage.tagAddButton.click();
    const dialog = dialogOf(page, LIBRARY_MESSAGES.tagAdd);
    await dialog.getByRole('textbox').first().fill(`${prefix}-fail`);
    await dialog.getByRole('button', { name: COMMON_MESSAGES.create, exact: true }).click();
    // 移植元の ja.json には ADMIN.LIBRARY.TAGS.CREATE_FAILED の訳がないため、文言は固定せずエラートーストが出ることを確かめる
    await expect(page.getByTestId('toast-error')).toBeVisible();
  });

  test('[09-40] ライブラリ Chrome（一般）', async ({ loginAs, libraryPage }) => {
    await loginAs('user');
    await libraryPage.openFromSidebar();
    await libraryPage.expectContentsVisible();
    await expect(libraryPage.tablist).toHaveCount(0);
    await libraryPage.search('存在しない検索語');
    await expect(libraryPage.rows).toHaveCount(0);
  });

  test('[09-41] ライブラリ Chrome（管理者）', async ({ loginAs, libraryPage, adminApi, page, prefix }) => {
    await loginAs('tenantAdmin');
    await libraryPage.openFromSidebar();
    await expect(libraryPage.tablist.getByText(LIBRARY_MESSAGES.tabContents, { exact: true })).toBeVisible();
    await libraryPage.selectTab(LIBRARY_MESSAGES.tabTags);
    const name = `${prefix}-chrome`;
    try {
      await libraryPage.tagAddButton.click();
      const dialog = dialogOf(page, LIBRARY_MESSAGES.tagAdd);
      await dialog.getByRole('textbox').first().fill(name);
      await dialog.getByRole('button', { name: COMMON_MESSAGES.create, exact: true }).click();
      await expect(libraryPage.tagRow(name)).toBeVisible();
    } finally {
      await deleteLibraryTagsByPrefix(adminApi, prefix);
    }
  });
});

/**
 * 「コンテンツの設定を編集」ダイアログを、保存せずにキャンセルで閉じる。
 *
 * @param dialog 開いているダイアログ
 */
async function cancelDialogByButton(dialog: ReturnType<LibraryPage['editDialog']>): Promise<void> {
  await dialog.getByRole('button', { name: COMMON_MESSAGES.cancel, exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
